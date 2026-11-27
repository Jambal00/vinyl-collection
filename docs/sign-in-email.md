# Sign-in email shared by Bowling Bro' and Vinyl

Both apps use the same Supabase project, so they share one "Magic link" email template and one sender.
The Vinyl app asks for its code with emailRedirectTo = https://jambal00.github.io/vinyl-collection/ ,
so the template can tell the apps apart with {{ .RedirectTo }}.

Dashboard → Authentication → URL Configuration → Redirect URLs: add
  https://jambal00.github.io/vinyl-collection/

Dashboard → Authentication → Emails → Magic link:

Subject:
{{ if eq .RedirectTo "https://jambal00.github.io/vinyl-collection/" }}Your Vinyl sign-in code: {{ .Token }}{{ else }}Your Bowling Bro' sign-in code: {{ .Token }}{{ end }}

Body:
{{ if eq .RedirectTo "https://jambal00.github.io/vinyl-collection/" }}
<h2>Your Vinyl Collection sign-in code</h2>
<p>Enter this code in the Vinyl app:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
<p>It expires in an hour. If you didn't ask for it, you can ignore this email.</p>
{{ else }}
...keep the current Bowling Bro' body here...
{{ end }}

Sender name (SMTP settings): use something neutral, such as "Pete's Apps", since it can't change per app.
