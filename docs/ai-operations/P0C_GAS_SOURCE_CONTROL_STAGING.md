# P0-C — Apps Script Source Control (Staging)

This branch introduces a read-only Git inventory for seven existing Apps Script source files. The repository copies are not verified against deployed Apps Script projects.

Run: node scripts/ai-operations/audit-gas-source.cjs
Test: node --test tests/ai-operations-gas-source.test.cjs

The output includes SHA-256 checksums and file sizes. It does not query or modify Apps Script, install triggers, set credentials, or deploy.

Before live connection: verify the owning Google account, map each Apps Script project ID, authorize read-only Apps Script API access, retrieve the live content to a private staging area, review source differences, and confirm safe handling of configuration and access. A future on-demand synchronization workflow must be separately reviewed and approved. Do not assume Git copies match live deployments.

No Production changes or automatic repair are enabled.
