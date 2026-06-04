package auth

import (
	"crypto/rand"
	"fmt"
)

func generateRandomBytes(b []byte) (int, error) {
	n, err := rand.Read(b)
	if err != nil {
		return 0, fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return n, nil
}
