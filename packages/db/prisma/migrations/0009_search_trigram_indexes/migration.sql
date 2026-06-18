CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_locations_name_trgm
  ON locations USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_locations_slug_trgm
  ON locations USING GIN (slug gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_locations_province_trgm
  ON locations USING GIN (province gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_locations_city_trgm
  ON locations USING GIN (city gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_locations_district_trgm
  ON locations USING GIN (district gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_photo_spots_name_trgm
  ON photo_spots USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_photo_spots_slug_trgm
  ON photo_spots USING GIN (slug gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_photo_spots_description_trgm
  ON photo_spots USING GIN (description gin_trgm_ops);
