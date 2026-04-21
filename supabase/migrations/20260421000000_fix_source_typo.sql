-- Fix typo created externally where the column was named "sourse" instead of "source"
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE lotomania_draws RENAME COLUMN sourse TO source;
  EXCEPTION
    WHEN undefined_column THEN
      -- Handle the case where the migration is re-run or the column was properly created directly
      NULL;
  END;
END $$;
