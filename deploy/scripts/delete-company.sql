-- Deletes ONE company and everything that belongs to it, for good. Made for the company of a load test.
--
--   psql -v ON_ERROR_STOP=1 -v key=carga -v name='Teste de Carga' -v commit=0 -f delete-company.sql   (rehearsal: rolls back)
--   psql -v ON_ERROR_STOP=1 -v key=carga -v name='Teste de Carga' -v commit=1 -f delete-company.sql   (for real)
--
-- It refuses to run when the key and the name do not match one company, when the company is still active, or when
-- the company owns video files (those live in the R2 and are not this script's to remove).
-- It leaves alone: the videos, subjects and courses of the library, the other companies, and the login attempt
-- windows (their keys are hashes; the API clears them after an hour).
\set ON_ERROR_STOP on
begin;
select set_config('sipat.key', :'key', true), set_config('sipat.name', :'name', true);

do $$
declare
  company uuid;
  active boolean;
  owned bigint;
  counted bigint;
  step text;
  steps text[] := array[
    -- what the participants did
    'delete from learning."PlaybackGrants" where "ParticipantId" in (select "Id" from identity."Users" where "TenantId" = $1)',
    'delete from learning."PlaybackQualitySessions" where "TenantId" = $1',
    'delete from learning."LearningActivityOutcomes" where "TenantId" = $1',
    'delete from learning."ParticipationCertificates" where "TenantId" = $1',
    'delete from learning."LearningProgress" where "TenantId" = $1',
    'delete from learning."LearningAssignments" where "TenantId" = $1',
    -- the trainings of the company
    'delete from learning."LearningContentSnapshots" where "TenantId" = $1',
    'delete from learning."LearningLessons" where "TenantId" = $1',
    'delete from learning."LearningTrackRevisions" where "TenantId" = $1',
    'delete from learning."LearningTracks" where "TenantId" = $1',
    'delete from sipats."SipatEventTargets" where "TenantId" = $1',
    'delete from sipats."SipatEvents" where "TenantId" = $1',
    'delete from learning."PlatformCourses" where "TenantId" = $1',
    'delete from learning."GameModules" where "TenantId" = $1',
    'update tenancy."Tenants" set "CertificateTemplateId" = null where "Id" = $1',
    'delete from learning."CertificateTemplates" where "TenantId" = $1',
    'delete from tenancy."CompanySubjects" where "TenantId" = $1',
    'delete from tenancy."CompanyVideos" where "TenantId" = $1',
    -- the people and where they work (roles, claims, logins and tokens go with each user)
    'delete from identity."Users" where "TenantId" = $1',
    'delete from identity."CompanyProfileRules" where "TenantId" = $1',
    'delete from identity."CompanyUnitSectors" where "TenantId" = $1',
    'delete from identity."CompanySectors" where "TenantId" = $1',
    'delete from identity."CompanyUnits" where "TenantId" = $1',
    'delete from audit."AuditEntries" where "TenantId" = $1',
    'delete from tenancy."Tenants" where "Id" = $1'
  ];
begin
  select "Id", "IsActive" into company, active from tenancy."Tenants"
    where "Key" = current_setting('sipat.key') and "Name" = current_setting('sipat.name');
  if company is null then
    raise exception 'No company with key % and name %: nothing was deleted.', current_setting('sipat.key'), current_setting('sipat.name');
  end if;
  if active then
    raise exception 'The company is still active. Turn it off in the operation first: nothing was deleted.';
  end if;
  select count(*) into owned from learning."PlatformCourseVideos" where "OwnerTenantId" = company;
  if owned > 0 then
    raise exception 'The company owns % video file(s) in the storage: nothing was deleted.', owned;
  end if;

  raise notice 'company % (%)', current_setting('sipat.name'), company;
  foreach step in array steps loop
    execute step using company;
    get diagnostics counted = row_count;
    raise notice '% rows: %', lpad(counted::text, 8), split_part(split_part(step, ' where ', 1), ' set ', 1);
  end loop;
end $$;

select count(*) as companies_left from tenancy."Tenants";
\if :commit
  commit;
  \echo 'COMMITTED: the company is gone.'
\else
  rollback;
  \echo 'REHEARSAL: rolled back, nothing was deleted.'
\endif
