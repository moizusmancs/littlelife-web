-- Guarded, dry-run-first removal of every E2E test row (accounts e2e-%@example.com, 'E2E ' NGOs / regions / shelters /
-- infrastructure / essential locations, their status reports, zones and 'e2e-' forecasts). One transaction; it refuses to run
-- if a real row is tied to a test region. Dry run:  docker exec -i littlelife_postgres psql -U littlelife -d littlelife -v end=ROLLBACK < e2e/cleanup-test-data.sql
-- Then re-run with -v end=COMMIT once the counts look right.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE t_accounts ON COMMIT DROP AS
  SELECT id FROM accounts WHERE email LIKE 'e2e-%@example.com';
CREATE TEMP TABLE t_ngos ON COMMIT DROP AS
  SELECT id FROM ngos WHERE name LIKE 'E2E %' AND created_by IN (SELECT id FROM t_accounts);

\echo == before
SELECT 'test accounts' AS what, count(*) FROM t_accounts
UNION ALL SELECT 'test NGOs', count(*) FROM t_ngos
UNION ALL SELECT 'E2E regions', count(*) FROM regions WHERE name LIKE 'E2E %'
UNION ALL SELECT 'ngo_regions of test NGOs', count(*) FROM ngo_regions WHERE ngo_id IN (SELECT id FROM t_ngos)
UNION ALL SELECT 'ngo_regions of REAL NGOs pointing at E2E regions (must be 0)', count(*)
  FROM ngo_regions WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %') AND ngo_id NOT IN (SELECT id FROM t_ngos)
UNION ALL SELECT 'E2E shelters', count(*) FROM shelters WHERE name LIKE 'E2E %'
UNION ALL SELECT 'E2E infrastructure', count(*) FROM infrastructure WHERE name LIKE 'E2E %'
UNION ALL SELECT 'E2E essential locations', count(*) FROM essential_locations WHERE name LIKE 'E2E %'
UNION ALL SELECT 'status reports on E2E places or by test accounts', count(*) FROM essential_location_status_reports
  WHERE essential_location_id IN (SELECT id FROM essential_locations WHERE name LIKE 'E2E %')
     OR shelter_id IN (SELECT id FROM shelters WHERE name LIKE 'E2E %')
     OR reported_by_account_id IN (SELECT id FROM t_accounts)
UNION ALL SELECT 'safety connections of test accounts', count(*) FROM safety_connections
  WHERE requester_account_id IN (SELECT id FROM t_accounts) OR recipient_account_id IN (SELECT id FROM t_accounts)
UNION ALL SELECT 'safety connections with a REAL account on the other side (must be 0)', count(*) FROM safety_connections
  WHERE (requester_account_id IN (SELECT id FROM t_accounts)) <> (recipient_account_id IN (SELECT id FROM t_accounts))
UNION ALL SELECT 'incident reports by test accounts', count(*) FROM incident_reports WHERE reporter_account_id IN (SELECT id FROM t_accounts)
UNION ALL SELECT 'aid requests by test accounts', count(*) FROM aid_requests WHERE requester_account_id IN (SELECT id FROM t_accounts)
UNION ALL SELECT 'missing persons by test accounts', count(*) FROM missing_persons WHERE reported_by_account_id IN (SELECT id FROM t_accounts)
UNION ALL SELECT 'donation campaigns by test accounts', count(*) FROM donation_campaigns WHERE organizer_account_id IN (SELECT id FROM t_accounts)
UNION ALL SELECT 'location trail rows of test accounts (the relay persists what a sharing account sends)', count(*) FROM location_trail WHERE account_id IN (SELECT id FROM t_accounts)
UNION ALL SELECT 'hazard zones in E2E regions', count(*) FROM hazard_zones WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %')
UNION ALL SELECT 'flood predictions in E2E regions', count(*) FROM flood_predictions WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %')
UNION ALL SELECT 'hazard zones made by test accounts outside E2E regions (must be 0)', count(*) FROM hazard_zones
  WHERE created_by IN (SELECT id FROM t_accounts) AND region_id NOT IN (SELECT id FROM regions WHERE name LIKE 'E2E %');

-- Refuse to run if a test account is connected to a real one, rather than silently severing someone's connection.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM safety_connections
             WHERE (requester_account_id IN (SELECT id FROM t_accounts)) <> (recipient_account_id IN (SELECT id FROM t_accounts))) THEN
    RAISE EXCEPTION 'a test account has a safety connection with a real account; not touching it';
  END IF;
END $$;

-- Refuse to run if a real organisation covers a test region, rather than silently taking their coverage away.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ngo_regions WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %')
             AND ngo_id NOT IN (SELECT id FROM t_ngos)) THEN
    RAISE EXCEPTION 'a non-test NGO covers an E2E region; not touching it';
  END IF;
  -- Same rule for the map's data: a real place, zone or forecast sitting in an E2E region is somebody's, not ours.
  IF EXISTS (SELECT 1 FROM shelters WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %') AND name NOT LIKE 'E2E %')
     OR EXISTS (SELECT 1 FROM infrastructure WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %') AND name NOT LIKE 'E2E %')
     OR EXISTS (SELECT 1 FROM essential_locations WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %') AND name NOT LIKE 'E2E %') THEN
    RAISE EXCEPTION 'a non-test place sits in an E2E region; not touching it';
  END IF;
END $$;

\echo == deleting (in dependency order)
-- The map's rows first (they point at accounts and regions): status reports, then zones before the forecasts they cite, then places.
DELETE FROM essential_location_status_reports
  WHERE essential_location_id IN (SELECT id FROM essential_locations WHERE name LIKE 'E2E %')
     OR shelter_id IN (SELECT id FROM shelters WHERE name LIKE 'E2E %')
     OR reported_by_account_id IN (SELECT id FROM t_accounts);
DELETE FROM hazard_zones      WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %') OR created_by IN (SELECT id FROM t_accounts);
DELETE FROM flood_predictions WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %') AND model_version LIKE 'e2e-%';
DELETE FROM shelters              WHERE name LIKE 'E2E %';
DELETE FROM infrastructure        WHERE name LIKE 'E2E %';
DELETE FROM essential_locations   WHERE name LIKE 'E2E %';

-- Activity: what a test account reported, voted on, requested, donated or sighted, and the rows those hang from (votes, media and sightings first; donations before the campaigns and aid requests they cite).
-- The live-location relay writes a throttled trail of what a sharing account sends; those rows point at the account.
DELETE FROM location_trail        WHERE account_id IN (SELECT id FROM t_accounts);
DELETE FROM incident_report_votes  WHERE account_id IN (SELECT id FROM t_accounts) OR incident_report_id IN (SELECT id FROM incident_reports WHERE reporter_account_id IN (SELECT id FROM t_accounts));
DELETE FROM incident_report_media  WHERE incident_report_id IN (SELECT id FROM incident_reports WHERE reporter_account_id IN (SELECT id FROM t_accounts));
DELETE FROM incident_reports       WHERE reporter_account_id IN (SELECT id FROM t_accounts);
DELETE FROM missing_person_sightings WHERE reported_by_account_id IN (SELECT id FROM t_accounts) OR missing_person_id IN (SELECT id FROM missing_persons WHERE reported_by_account_id IN (SELECT id FROM t_accounts));
DELETE FROM missing_persons        WHERE reported_by_account_id IN (SELECT id FROM t_accounts);
DELETE FROM donations              WHERE donor_account_id IN (SELECT id FROM t_accounts) OR campaign_id IN (SELECT id FROM donation_campaigns WHERE organizer_account_id IN (SELECT id FROM t_accounts)) OR allocated_to_aid_request_id IN (SELECT id FROM aid_requests WHERE requester_account_id IN (SELECT id FROM t_accounts));
DELETE FROM donation_campaigns     WHERE organizer_account_id IN (SELECT id FROM t_accounts);
DELETE FROM aid_requests           WHERE requester_account_id IN (SELECT id FROM t_accounts);
DELETE FROM safety_connections          WHERE requester_account_id IN (SELECT id FROM t_accounts) OR recipient_account_id IN (SELECT id FROM t_accounts);
DELETE FROM alert_preferences           WHERE account_id IN (SELECT id FROM t_accounts);
DELETE FROM profiles                    WHERE account_id IN (SELECT id FROM t_accounts);
DELETE FROM trust_scores                WHERE account_id IN (SELECT id FROM t_accounts);
DELETE FROM moderation_actions          WHERE performed_by IN (SELECT id FROM t_accounts) OR target_account_id IN (SELECT id FROM t_accounts);
DELETE FROM ngo_volunteer_invitations   WHERE ngo_id IN (SELECT id FROM t_ngos) OR invited_account_id IN (SELECT id FROM t_accounts) OR invited_by IN (SELECT id FROM t_accounts);
DELETE FROM ngo_regions                 WHERE ngo_id IN (SELECT id FROM t_ngos);
UPDATE accounts SET ngo_id = NULL       WHERE id IN (SELECT id FROM t_accounts) AND ngo_id IS NOT NULL;
DELETE FROM ngos                        WHERE id IN (SELECT id FROM t_ngos);
DELETE FROM accounts                    WHERE id IN (SELECT id FROM t_accounts);

-- Regions: leaves first (a region another one still points at as its parent stays until its children are gone).
DELETE FROM ngo_regions                 WHERE region_id IN (SELECT id FROM regions WHERE name LIKE 'E2E %');
DELETE FROM regions WHERE name LIKE 'E2E %' AND id NOT IN (SELECT parent_region_id FROM regions WHERE parent_region_id IS NOT NULL);
DELETE FROM regions WHERE name LIKE 'E2E %' AND id NOT IN (SELECT parent_region_id FROM regions WHERE parent_region_id IS NOT NULL);
DELETE FROM regions WHERE name LIKE 'E2E %' AND id NOT IN (SELECT parent_region_id FROM regions WHERE parent_region_id IS NOT NULL);
DELETE FROM regions WHERE name LIKE 'E2E %' AND id NOT IN (SELECT parent_region_id FROM regions WHERE parent_region_id IS NOT NULL);

\echo == after (inside the transaction)
SELECT 'accounts left' AS what, count(*) FROM accounts UNION ALL
SELECT 'e2e accounts left', count(*) FROM accounts WHERE email LIKE 'e2e-%' UNION ALL
SELECT 'ngos left', count(*) FROM ngos UNION ALL
SELECT 'E2E ngos left', count(*) FROM ngos WHERE name LIKE 'E2E %' UNION ALL
SELECT 'regions left', count(*) FROM regions UNION ALL
SELECT 'E2E regions left', count(*) FROM regions WHERE name LIKE 'E2E %' UNION ALL
SELECT 'ngo_regions left', count(*) FROM ngo_regions UNION ALL
SELECT 'shelters left', count(*) FROM shelters UNION ALL
SELECT 'E2E shelters left', count(*) FROM shelters WHERE name LIKE 'E2E %' UNION ALL
SELECT 'infrastructure left', count(*) FROM infrastructure UNION ALL
SELECT 'essential locations left', count(*) FROM essential_locations UNION ALL
SELECT 'hazard zones left', count(*) FROM hazard_zones UNION ALL
SELECT 'flood predictions left', count(*) FROM flood_predictions UNION ALL
SELECT 'status reports left', count(*) FROM essential_location_status_reports UNION ALL
SELECT 'safety_connections left', count(*) FROM safety_connections UNION ALL
SELECT 'location_trail left', count(*) FROM location_trail UNION ALL
SELECT 'incident_reports left', count(*) FROM incident_reports UNION ALL
SELECT 'aid_requests left', count(*) FROM aid_requests UNION ALL
SELECT 'missing_persons left', count(*) FROM missing_persons UNION ALL
SELECT 'donation_campaigns left', count(*) FROM donation_campaigns UNION ALL
SELECT 'donations left', count(*) FROM donations UNION ALL
SELECT 'trust_scores left', count(*) FROM trust_scores UNION ALL
SELECT 'moderation_actions left', count(*) FROM moderation_actions UNION ALL
SELECT 'refresh_tokens left', count(*) FROM refresh_tokens;

:end;
