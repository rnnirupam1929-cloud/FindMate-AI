# Supabase email templates (suggested wording)

Supabase → Authentication → Email Templates. Keep the `{{ .ConfirmationURL }}` variable exactly.

**Confirm sign up**
Subject: `Confirm your FindMate AI account`
Body: `Hi, welcome to FindMate AI. Confirm your email to start reporting and finding items: {{ .ConfirmationURL }}. If you didn't sign up, you can ignore this email.`

**Reset password**
Subject: `Reset your FindMate AI password`
Body: `We got a request to reset your password. Choose a new one here: {{ .ConfirmationURL }}. If this wasn't you, ignore this email; your password stays the same.`

Also set **Site URL** to your frontend URL and add `<frontend>/login` to the redirect allow-list.
