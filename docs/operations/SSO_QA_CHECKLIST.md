# Protected QA access checklist

- Keep Vercel Authentication enabled.
- Read source data through approved Drive and Supabase connections.
- Use the authorized Vercel connection to check protected deployment HTTP reachability.
- Do not equate HTTP 200 with authenticated application UI success.
- Reuse existing isolated local Viewer E2E and protected Preview QA workflows.
- Production browser E2E requires a reviewed identity, environment-scoped access and authorization tests before activation.
- Never store user passwords, bearer tokens or protection bypass secrets in repository files or logs.
- Preserve existing Defect, Materials, Calendar and LINE production behavior.

Status: setup checklist only; Production authenticated browser testing is not yet configured.
