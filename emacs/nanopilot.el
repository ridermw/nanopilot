;;; nanopilot.el --- Emacs interface for NanoPilot AI assistant -*- lexical-binding: t -*-

;; Author: NanoPilot
;; Version: 0.1.0
;; Package-Requires: ((emacs "27.1"))
;; Keywords: ai, assistant, chat
;;
;; Vanilla Emacs (init.el):
;;   (load-file "~/src/nanopilot/emacs/nanopilot.el")
;;   (global-set-key (kbd "C-c n c") #'nanopilot-chat)
;;   (global-set-key (kbd "C-c n o") #'nanopilot-org-send)
;;
;; Spacemacs (~/.spacemacs, in dotspacemacs/user-config):
;;   (load-file "~/src/nanopilot/emacs/nanopilot.el")
;;   (spacemacs/set-leader-keys "aNc" #'nanopilot-chat)
;;   (spacemacs/set-leader-keys "aNo" #'nanopilot-org-send)
;;
;; Doom Emacs (config.el):
;;   (load (expand-file-name "~/src/nanopilot/emacs/nanopilot.el"))
;;   (map! :leader
;;         :prefix ("N" . "NanoPilot")
;;         :desc "Chat buffer" "c" #'nanopilot-chat
;;         :desc "Send org"    "o" #'nanopilot-org-send)
;;   ;; Evil users: teach evil about the C-c C-c send binding
;;   (after! evil
;;     (evil-define-key '(normal insert) nanopilot-chat-mode-map
;;       (kbd "C-c C-c") #'nanopilot-chat-send))

;;; Code:

(require 'cl-lib)
(require 'url)
(require 'json)
(require 'org)

;; ---------------------------------------------------------------------------
;; Customization

(defgroup nanopilot nil
  "NanoPilot AI assistant interface."
  :group 'tools
  :prefix "nanopilot-")

(defcustom nanopilot-host "localhost"
  "Hostname where NanoPilot is running."
  :type 'string
  :group 'nanopilot)

(defcustom nanopilot-port 8766
  "Port for the NanoPilot Emacs channel HTTP server."
  :type 'integer
  :group 'nanopilot)

(defcustom nanopilot-auth-token nil
  "Bearer token for NanoPilot authentication (matches EMACS_AUTH_TOKEN in .env).
Leave nil if EMACS_AUTH_TOKEN is not set."
  :type '(choice (const nil) string)
  :group 'nanopilot)

(defcustom nanopilot-poll-interval 1.5
  "Seconds between response polls when waiting for a reply."
  :type 'number
  :group 'nanopilot)

(defcustom nanopilot-agent-name "Andy"
  "Display name for the NanoPilot agent (matches ASSISTANT_NAME in .env)."
  :type 'string
  :group 'nanopilot)

(defcustom nanopilot-convert-to-org t
  "When non-nil, convert agent responses to org-mode format.
Uses pandoc when available; falls back to regex substitutions."
  :type 'boolean
  :group 'nanopilot)

(defcustom nanopilot-timestamp-format "%H:%M"
  "Format string for timestamps shown next to agent replies in the chat buffer.
Passed to `format-time-string'.  Set to nil to suppress timestamps."
  :type '(choice (const nil) string)
  :group 'nanopilot)

;; ---------------------------------------------------------------------------
;; Formatting helpers

(defun nanopilot--to-org (text)
  "Convert TEXT (markdown or plain) to org-mode markup.
Tries pandoc -f gfm -t org when available; falls back to regex."
  (if (not nanopilot-convert-to-org)
      text
    (if (executable-find "pandoc")
        (with-temp-buffer
          (insert text)
          (let* ((coding-system-for-read 'utf-8)
                 (coding-system-for-write 'utf-8)
                 (exit (call-process-region
                        (point-min) (point-max)
                        "pandoc" t t nil "-f" "gfm" "-t" "org" "--wrap=none")))
            (if (zerop exit)
                (string-trim (buffer-string))
              text)))
      (nanopilot--md-to-org-regex text))))

;; NOTE: This function expects standard markdown as input (e.g. **bold**, *italic*).
;; Agents responding on this channel must output markdown, not org-mode syntax.
;; If the agent outputs org-mode directly, markers like *bold* will be incorrectly
;; re-converted to /bold/ by the italic rule.
(defun nanopilot--md-to-org-regex (text)
  "Lightweight markdown → org conversion using regexp substitutions."
  (let ((s text))
    ;; Fenced code blocks  ```lang\n…\n```  →  #+begin_src lang\n…\n#+end_src
    ;; (must run before inline-code to avoid mangling backticks)
    (setq s (replace-regexp-in-string
             "```\\([a-zA-Z0-9_-]*\\)\n\\(\\(?:.\\|\n\\)*?\\)```"
             (lambda (m)
               (let ((lang (match-string 1 m))
                     (body (match-string 2 m)))
                 (concat "#+begin_src " (if (string-empty-p lang) "text" lang)
                         "\n" body "#+end_src")))
             s t))
    ;; Bold **text** → *text*, italic *text* → /text/
    ;; Two-pass to prevent the italic regex from re-matching the bold result:
    ;; 1. Mark bold spans with a placeholder (control char \x01)
    (setq s (replace-regexp-in-string "\\*\\*\\(.+?\\)\\*\\*" "\x01\\1\x01" s))
    ;; 2. Convert remaining single-star spans to italic
    (setq s (replace-regexp-in-string "\\*\\(.+?\\)\\*" "/\\1/" s))
    ;; 3. Resolve bold placeholders to org bold markers
    (setq s (replace-regexp-in-string "\x01\\(.+?\\)\x01" "*\\1*" s))
    ;; Strikethrough  ~~text~~ → +text+
    (setq s (replace-regexp-in-string "~~\\(.+?\\)~~" "+\\1+" s))
    ;; Underline  __text__ → _text_
    (setq s (replace-regexp-in-string "__\\(.+?\\)__" "_\\1_" s))
    ;; Inline code  `code` → ~code~
    (setq s (replace-regexp-in-string "`\\([^`]+\\)`" "~\\1~" s))
    ;; ATX headings  ## …  →  ** …
    (setq s (replace-regexp-in-string
             "^\\(#+\\) "
             (lambda (m) (concat (make-string (length (match-string 1 m)) ?*) " "))
             s))
    ;; Links  [text](url) → [[url][text]]
    (setq s (replace-regexp-in-string
             "\\[\\([^]]+\\)\\](\\([^)]+\\))" "[[\\2][\\1]]" s))
    s))

(defun nanopilot--format-timestamp ()
  "Return a formatted timestamp string, or nil if disabled."
  (when nanopilot-timestamp-format
    (format-time-string nanopilot-timestamp-format)))

;; ---------------------------------------------------------------------------
;; Internal state

(defvar nanopilot--poll-timer nil
  "Timer used to poll for responses in the chat buffer.")

(defvar nanopilot--last-timestamp 0
  "Epoch ms of the most recently received message.")

(defvar nanopilot--pending nil
  "Non-nil while waiting for a response.")

(defvar-local nanopilot--thinking-dot-count 0
  "Dot cycle counter for the animated thinking indicator.")

(defvar-local nanopilot--input-beg nil
  "Marker for the start of the current user input area.")

;; ---------------------------------------------------------------------------
;; HTTP helpers

(defun nanopilot--url (path)
  "Return the full URL for PATH on the NanoPilot server."
  (format "http://%s:%d%s" nanopilot-host nanopilot-port path))

(defun nanopilot--headers ()
  "Return alist of HTTP headers for NanoPilot requests."
  (let ((hdrs '(("Content-Type" . "application/json"))))
    (when nanopilot-auth-token
      (push (cons "Authorization" (concat "Bearer " nanopilot-auth-token)) hdrs))
    hdrs))

(defun nanopilot--post (text callback)
  "POST TEXT to NanoPilot and call CALLBACK with the response alist."
  (let* ((url-request-method "POST")
         (url-request-extra-headers (nanopilot--headers))
         (url-request-data (encode-coding-string
                            (json-encode `((text . ,text)))
                            'utf-8)))
    (url-retrieve
     (nanopilot--url "/api/message")
     (lambda (status)
       (if (plist-get status :error)
           (message "NanoPilot: POST error %s" (plist-get status :error))
         (goto-char (point-min))
         (re-search-forward "\n\n" nil t)
         (let ((data (ignore-errors (json-read))))
           (funcall callback data))))
     nil t t)))

(defun nanopilot--poll (since callback)
  "GET messages newer than SINCE (epoch ms) and call CALLBACK with the list."
  (let* ((url-request-method "GET")
         (url-request-extra-headers (nanopilot--headers)))
    (url-retrieve
     (nanopilot--url (format "/api/messages?since=%d" since))
     (lambda (status)
       (unless (plist-get status :error)
         (goto-char (point-min))
         (re-search-forward "\n\n" nil t)
         (let* ((raw  (buffer-substring-no-properties (point) (point-max)))
                (body (decode-coding-string raw 'utf-8))
                (data (ignore-errors (json-read-from-string body)))
                (msgs (cdr (assq 'messages data))))
           (when msgs (funcall callback (append msgs nil))))))
     nil t t)))

;; ---------------------------------------------------------------------------
;; Chat buffer

(defvar nanopilot-chat-mode-map
  (let ((map (make-sparse-keymap)))
    (define-key map (kbd "RET")      #'newline)
    (define-key map (kbd "<return>") #'newline)
    (define-key map (kbd "C-c C-c") #'nanopilot-chat-send)
    map)
  "Keymap for `nanopilot-chat-mode'.")

(define-derived-mode nanopilot-chat-mode org-mode "NanoPilot"
  "Major mode for the NanoPilot chat buffer.
Derives from org-mode so that org markup (headings, bold, code blocks,
etc.) is fontified automatically.  RET and <return> insert plain newlines
for multi-line input; send with C-c C-c."
  (setq-local word-wrap t)
  (visual-line-mode 1)
  ;; Disable org features that conflict with a linear chat buffer
  (setq-local org-return-follows-link nil)
  (setq-local org-cycle-emulate-tab nil)
  ;; Ensure send binding beats org-mode's C-c C-c via the buffer-local map
  (local-set-key (kbd "C-c C-c") #'nanopilot-chat-send))

(defun nanopilot--advance-input-beg ()
  "Move `nanopilot--input-beg' to point-max in the chat buffer."
  (with-current-buffer (nanopilot--chat-buffer)
    (when nanopilot--input-beg (set-marker nanopilot--input-beg nil))
    (setq nanopilot--input-beg (copy-marker (point-max)))))

(defun nanopilot--chat-buffer ()
  "Return the NanoPilot chat buffer, creating it if necessary."
  (or (get-buffer "*NanoPilot*")
      (with-current-buffer (get-buffer-create "*NanoPilot*")
        (nanopilot-chat-mode)
        (set-buffer-file-coding-system 'utf-8)
        (add-hook 'kill-buffer-hook #'nanopilot--stop-poll nil t)
        (nanopilot--insert-header)
        (setq nanopilot--input-beg (copy-marker (point-max)))
        (current-buffer))))

(defun nanopilot--insert-header ()
  "Insert the welcome header into the chat buffer."
  (let ((inhibit-read-only t))
    (insert (propertize
             (format "── NanoPilot (%s) ──────────────────────────────\n\n"
                     nanopilot-agent-name)
             'face 'font-lock-comment-face))))

(defun nanopilot--chat-insert (speaker text)
  "Append SPEAKER: TEXT to the chat buffer."
  (with-current-buffer (nanopilot--chat-buffer)
    (let* ((inhibit-read-only t)
           (is-agent (not (string= speaker "You")))
           (display-text (if is-agent (nanopilot--to-org text) text))
           (ts (nanopilot--format-timestamp))
           (label (if ts (format "%s [%s]" speaker ts) speaker))
           (face  (if is-agent 'font-lock-string-face 'font-lock-keyword-face)))
      (goto-char (point-max))
      (insert (propertize (concat label ": ") 'face face))
      (insert display-text "\n\n")
      (goto-char (point-max))
      (when is-agent
        (nanopilot--advance-input-beg)))))

;;;###autoload
(defun nanopilot-chat ()
  "Open the NanoPilot chat buffer."
  (interactive)
  (pop-to-buffer (nanopilot--chat-buffer))
  (goto-char (point-max)))

(defun nanopilot-chat-send ()
  "Send the accumulated input area as a message to NanoPilot.
Use C-c C-c to send; RET inserts a plain newline for multi-line messages."
  (interactive)
  (when nanopilot--pending
    (message "NanoPilot: waiting for previous response...")
    (cl-return-from nanopilot-chat-send))
  (let* ((beg (if (and nanopilot--input-beg (marker-buffer nanopilot--input-beg))
                  (marker-position nanopilot--input-beg)
                (line-beginning-position)))
         (text (string-trim (buffer-substring-no-properties beg (point-max)))))
    (when (string-empty-p text)
      (user-error "Nothing to send"))
    (let ((inhibit-read-only t))
      (delete-region beg (point-max)))
    (nanopilot--chat-insert "You" text)
    (nanopilot--advance-input-beg)
    (setq nanopilot--pending t)
    (nanopilot--post text
                    (lambda (data)
                      (when data
                        (setq nanopilot--last-timestamp
                              (or (cdr (assq 'timestamp data))
                                  nanopilot--last-timestamp))
                        (nanopilot--start-thinking)
                        (nanopilot--start-poll))))))

(defun nanopilot--start-poll ()
  "Start polling for new messages."
  (nanopilot--stop-poll)
  (setq nanopilot--poll-timer
        (run-with-timer nanopilot-poll-interval nanopilot-poll-interval
                        #'nanopilot--poll-tick)))

(defun nanopilot--stop-poll ()
  "Stop the polling timer."
  (when nanopilot--poll-timer
    (cancel-timer nanopilot--poll-timer)
    (setq nanopilot--poll-timer nil)))

(defun nanopilot--start-thinking ()
  "Insert an animated thinking indicator at the end of the chat buffer."
  (with-current-buffer (nanopilot--chat-buffer)
    (let ((inhibit-read-only t))
      (goto-char (point-max))
      (setq nanopilot--thinking-dot-count 1)
      (insert (propertize (format "%s: .\n\n" nanopilot-agent-name)
                          'nanopilot-thinking t
                          'face 'font-lock-string-face)))))

(defun nanopilot--tick-thinking ()
  "Advance the dot animation in the thinking indicator."
  (let ((buf (get-buffer "*NanoPilot*")))
    (when buf
      (with-current-buffer buf
        (when nanopilot--pending
          (let* ((inhibit-read-only t)
                 (pos (text-property-any (point-min) (point-max)
                                         'nanopilot-thinking t)))
            (when pos
              (let* ((end (or (next-single-property-change
                               pos 'nanopilot-thinking) (point-max)))
                     (n (1+ (mod nanopilot--thinking-dot-count 3))))
                (setq nanopilot--thinking-dot-count n)
                (delete-region pos end)
                (save-excursion
                  (goto-char pos)
                  (insert (propertize
                           (format "%s: %s\n\n" nanopilot-agent-name
                                   (make-string n ?.))
                           'nanopilot-thinking t
                           'face 'font-lock-string-face)))))))))))

(defun nanopilot--clear-thinking ()
  "Remove the thinking indicator from the chat buffer."
  (let ((buf (get-buffer "*NanoPilot*")))
    (when buf
      (with-current-buffer buf
        (let* ((inhibit-read-only t)
               (pos (text-property-any (point-min) (point-max)
                                       'nanopilot-thinking t)))
          (when pos
            (delete-region pos (or (next-single-property-change
                                    pos 'nanopilot-thinking) (point-max)))))))))

(defun nanopilot--poll-tick ()
  "Poll for new messages and insert them into the chat buffer."
  (nanopilot--tick-thinking)
  (nanopilot--poll
   nanopilot--last-timestamp
   (lambda (msgs)
     (dolist (msg msgs)
       (let ((text (cdr (assq 'text msg)))
             (ts   (cdr (assq 'timestamp msg))))
         (when (and text (> ts nanopilot--last-timestamp))
           (setq nanopilot--last-timestamp ts)
           (nanopilot--clear-thinking)
           (nanopilot--chat-insert nanopilot-agent-name text))))
     (when msgs
       (setq nanopilot--pending nil)
       (nanopilot--stop-poll)))))

;; ---------------------------------------------------------------------------
;; Org integration

;;;###autoload
(defun nanopilot-org-send ()
  "Send the current org subtree to NanoPilot and insert the response as a child.

If a region is active, send the region text instead."
  (interactive)
  (unless (derived-mode-p 'org-mode)
    (user-error "Not in an org-mode buffer"))
  (let ((text (if (use-region-p)
                  (buffer-substring-no-properties (region-beginning) (region-end))
                (nanopilot--org-subtree-text))))
    (when (string-empty-p (string-trim text))
      (user-error "Nothing to send"))
    (message "NanoPilot: sending to %s..." nanopilot-agent-name)
    (let ((marker (point-marker))
          (buf    (current-buffer)))
      (nanopilot--post
       text
       (lambda (data)
         (let* ((ts (or (cdr (assq 'timestamp data)) (nanopilot--now-ms)))
                (level (with-current-buffer buf
                         (save-excursion (goto-char marker) (org-outline-level))))
                (ph (with-current-buffer buf
                      (save-excursion
                        (goto-char marker)
                        (nanopilot--org-insert-placeholder level)))))
           (nanopilot--poll-until-response
            ts
            (lambda (response)
              (with-current-buffer buf
                (save-excursion
                  (when (marker-buffer ph)
                    (let* ((inhibit-read-only t)
                           (beg (marker-position ph))
                           (end (save-excursion
                                  (goto-char (1+ beg))
                                  (org-next-visible-heading 1)
                                  (point))))
                      (delete-region beg end))
                    (set-marker ph nil))
                  (goto-char marker)
                  (nanopilot--org-insert-response response))))
            (lambda ()
              (message "NanoPilot: timed out waiting for response")
              (when (marker-buffer ph)
                (with-current-buffer (marker-buffer ph)
                  (let* ((inhibit-read-only t)
                         (beg (marker-position ph))
                         (end (save-excursion
                                (goto-char (1+ beg))
                                (org-next-visible-heading 1)
                                (point))))
                    (delete-region beg end))
                  (set-marker ph nil)))))))))))

(defun nanopilot--org-insert-placeholder (level)
  "Insert a processing child heading at LEVEL+1 and return a marker at its start."
  (org-back-to-heading t)
  (org-end-of-subtree t t)
  (let ((beg (point)))
    (insert "\n" (make-string (1+ level) ?*) " "
            nanopilot-agent-name " [processing...]\n\n")
    (copy-marker beg)))

(defun nanopilot--org-subtree-text ()
  "Return the text of the org subtree at point (heading + body)."
  (org-with-wide-buffer
   (org-back-to-heading t)
   (let ((start (point))
         (end   (progn (org-end-of-subtree t t) (point))))
     (buffer-substring-no-properties start end))))

(defun nanopilot--org-insert-response (text)
  "Insert TEXT as a child org heading under the current subtree."
  (org-back-to-heading t)
  (let* ((level (org-outline-level))
         (child-stars (make-string (1+ level) ?*))
         (timestamp (format-time-string "[%Y-%m-%d %a %H:%M]"))
         (body (nanopilot--to-org text)))
    (org-end-of-subtree t t)
    (insert "\n" child-stars " " nanopilot-agent-name " " timestamp "\n"
            body "\n")))

(defun nanopilot--now-ms ()
  "Return current time as milliseconds since epoch."
  (let ((time (current-time)))
    (+ (* (+ (* (car time) 65536) (cadr time)) 1000)
       (/ (caddr time) 1000))))

(defun nanopilot--poll-until-response (since callback timeout-fn &optional attempts)
  "Poll until a message newer than SINCE arrives, then call CALLBACK.
Calls TIMEOUT-FN after 60 attempts (~90s)."
  (let ((n (or attempts 0)))
    (if (>= n 60)
        (funcall timeout-fn)
      (nanopilot--poll
       since
       (lambda (msgs)
         (let ((fresh (seq-filter (lambda (m) (> (cdr (assq 'timestamp m)) since))
                                  msgs)))
           (if fresh
               (let ((text (mapconcat (lambda (m) (cdr (assq 'text m)))
                                      fresh "\n")))
                 (funcall callback text))
             (run-with-timer nanopilot-poll-interval nil
                             #'nanopilot--poll-until-response
                             since callback timeout-fn (1+ n)))))))))

;; ---------------------------------------------------------------------------

(provide 'nanopilot)
;;; nanopilot.el ends here
