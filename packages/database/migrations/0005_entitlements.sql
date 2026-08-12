insert into plan (code, generation_quota, features, is_public_listed)
values
  (
    'free',
    3,
    '{
      "portfolio.generate": true,
      "recipe.auto": true,
      "brew.cowork": false,
      "template.pro": false,
      "analytics.full": false,
      "analytics.organization_domains": false,
      "analytics.returning_visitors": false,
      "export.document": false,
      "publishing.custom_domain": false,
      "publishing.remove_badge": false,
      "analysis.advanced": false,
      "collaboration.team": false,
      "generation.unlimited": false
    }'::jsonb,
    true
  ),
  (
    'pro',
    0,
    '{
      "portfolio.generate": true,
      "recipe.auto": true,
      "brew.cowork": true,
      "template.pro": true,
      "analytics.full": true,
      "analytics.organization_domains": true,
      "analytics.returning_visitors": false,
      "export.document": true,
      "publishing.custom_domain": false,
      "publishing.remove_badge": false,
      "analysis.advanced": false,
      "collaboration.team": false,
      "generation.unlimited": true
    }'::jsonb,
    true
  ),
  (
    'team',
    0,
    '{
      "portfolio.generate": true,
      "recipe.auto": true,
      "brew.cowork": true,
      "template.pro": true,
      "analytics.full": true,
      "analytics.organization_domains": true,
      "analytics.returning_visitors": true,
      "export.document": true,
      "publishing.custom_domain": true,
      "publishing.remove_badge": true,
      "analysis.advanced": true,
      "collaboration.team": true,
      "generation.unlimited": true
    }'::jsonb,
    true
  )
on conflict (code) do nothing;
