# Phase 11 Social Auth

Bulletin currently supports Google OAuth through Supabase Auth. The Apple flow
is implemented but deliberately dormant: the sign-in page keeps a disabled
Apple control marked `Coming soon`, and the server rejects direct Apple
authorization attempts before contacting Supabase.

Provider credentials are configured in Supabase and must not be committed or
added to client-side environment variables.

## Shared application callback

- Production: `https://bulletinbrief.in/auth/callback`
- Local application: `http://localhost:3000/auth/callback`
- Supabase provider callback:
  `https://ntbejxkppnzcvwqadjma.supabase.co/auth/v1/callback`

The application callback URLs belong in the Supabase Auth redirect allow list.
Google and Apple return to the Supabase provider callback.

## Apple provider (planned)

Apple web OAuth requires an active Apple Developer Program membership and:

1. An App ID with Sign in with Apple enabled.
2. A Services ID associated with that App ID.
3. Website configuration using domain
   `ntbejxkppnzcvwqadjma.supabase.co` and return URL
   `https://ntbejxkppnzcvwqadjma.supabase.co/auth/v1/callback`.
4. A Sign in with Apple key and its downloaded `.p8` file.
5. A generated Apple client secret entered in the Supabase Apple provider
   configuration together with the Services ID.
6. Email relay sources registered with Apple for the Bulletin sending domain.

The Services ID must be the first Supabase Apple Client ID when web and native
IDs are both configured.

Do not enable the Apple provider or the application feature gate until this
configuration is complete and the full callback flow has passed local and
preview testing.

Apple web OAuth client secrets expire after at most six months. Record the
creation and expiry dates and rotate the secret before expiry. Keep the `.p8`
file outside the repository and revoke the key immediately if it is lost or
exposed.

Apple's OAuth flow does not provide a reusable full name. Bulletin therefore
collects the subscriber name during onboarding. If a user chooses Hide My
Email, Bulletin treats the Apple relay address as that account's verified
email. It is not automatically merged with a different Google identity.
