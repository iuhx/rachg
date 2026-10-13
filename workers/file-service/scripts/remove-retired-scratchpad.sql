-- One-time cleanup of the retired scratchpad, applied on 2026-10-13.
-- The scratchpad/ R2 prefix was checked and contained no objects.
-- Active notes, files, mail and their storage are outside this operation.
DROP TABLE IF EXISTS scratchpad_cleanup;
DROP TABLE IF EXISTS scratchpad;
