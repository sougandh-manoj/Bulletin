-- Emergency scheduler stop. This removes only Bulletin-owned recurring jobs;
-- it does not delete application data, Vault secrets, extensions, or functions.

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'bulletin-ingestion',
  'bulletin-intelligence',
  'bulletin-shared-summaries',
  'bulletin-personalization',
  'bulletin-delivery'
);
