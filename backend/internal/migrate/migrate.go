package migrate

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Run(ctx context.Context, pool *pgxpool.Pool, migrationsFS fs.FS) error {
	if err := ensureTable(ctx, pool, migrationsFS); err != nil {
		return fmt.Errorf("setup migrations table: %w", err)
	}

	rows, err := pool.Query(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return fmt.Errorf("query applied migrations: %w", err)
	}
	applied := make(map[string]bool)
	for rows.Next() {
		var v string
		if scanErr := rows.Scan(&v); scanErr != nil {
			return scanErr
		}
		applied[v] = true
	}
	rows.Close()

	var files []string
	fs.WalkDir(migrationsFS, ".", func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr == nil && !d.IsDir() && strings.HasSuffix(path, ".up.sql") {
			files = append(files, path)
		}
		return nil
	})
	sort.Strings(files)

	for _, file := range files {
		version := filepath.Base(file)
		if applied[version] {
			continue
		}

		sql, err := fs.ReadFile(migrationsFS, file)
		if err != nil {
			return fmt.Errorf("read %s: %w", file, err)
		}

		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("apply %s: %w", version, err)
		}

		if _, err := pool.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
			return fmt.Errorf("record %s: %w", version, err)
		}

		log.Printf("migration applied: %s", version)
	}

	return nil
}

func ensureTable(ctx context.Context, pool *pgxpool.Pool, migrationsFS fs.FS) error {
	var colType string
	err := pool.QueryRow(ctx, `
		SELECT data_type
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name   = 'schema_migrations'
		  AND column_name  = 'version'
	`).Scan(&colType)

	if err == pgx.ErrNoRows {

		_, err = pool.Exec(ctx, `
			CREATE TABLE schema_migrations (
				version    TEXT PRIMARY KEY,
				applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
			)
		`)
		return err
	}
	if err != nil {
		return err
	}

	if colType == "text" || colType == "character varying" {
		return nil
	}

	var oldVersions []int64
	oldRows, qErr := pool.Query(ctx, "SELECT version FROM schema_migrations")
	if qErr == nil {
		for oldRows.Next() {
			var v int64
			if sErr := oldRows.Scan(&v); sErr == nil {
				oldVersions = append(oldVersions, v)
			}
		}
		oldRows.Close()
	}

	var files []string
	fs.WalkDir(migrationsFS, ".", func(path string, d fs.DirEntry, wErr error) error {
		if wErr == nil && !d.IsDir() && strings.HasSuffix(path, ".up.sql") {
			files = append(files, path)
		}
		return nil
	})
	sort.Strings(files)

	if _, err := pool.Exec(ctx, "DROP TABLE schema_migrations"); err != nil {
		return fmt.Errorf("drop old migrations table: %w", err)
	}
	if _, err := pool.Exec(ctx, `
		CREATE TABLE schema_migrations (
			version    TEXT PRIMARY KEY,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}

	for _, v := range oldVersions {
		prefix := fmt.Sprintf("%06d", v)
		for _, f := range files {
			base := filepath.Base(f)
			if strings.HasPrefix(base, prefix) {
				if _, insErr := pool.Exec(ctx,
					"INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", base,
				); insErr != nil {
					log.Printf("warning: could not record migrated version %d: %v", v, insErr)
				}
				break
			}
		}
	}

	log.Printf("converted schema_migrations from golang-migrate format (%d versions backfilled)", len(oldVersions))
	return nil
}
