--Añade información sobre grupos y usuarios

ALTER TABLE groups ADD COLUMN name TEXT;

ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN surname TEXT;

UPDATE database SET value = '1' WHERE property ='database.version';