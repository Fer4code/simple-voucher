#!/bin/bash
# clean-db.sh
# This script deletes the SQLite database files to fully clean the Voucher DB.
# The backend will automatically recreate the database file and table on the next run.

DB_DIR="$(dirname "$0")/data"
if [ -d "/app/data" ]; then
    DB_DIR="/app/data"
fi

echo "Cleaning up the Voucher DB at $DB_DIR..."

if [ -f "$DB_DIR/vouchers.db" ]; then
    # Remove the main database file
    rm -f "$DB_DIR/vouchers.db"
    
    # Remove SQLite Write-Ahead Logging (WAL) and Shared Memory files if they exist
    rm -f "$DB_DIR/vouchers.db-wal"
    rm -f "$DB_DIR/vouchers.db-shm"
    
    echo "Database files removed successfully."
    echo "The database will be recreated automatically the next time the Node.js backend starts."
else
    echo "Database file not found at $DB_DIR/vouchers.db. Nothing to clean."
fi

echo "Done!"
