package guest

import "testing"

func TestRepoPolicyNormalizesAndChecksAllowlist(t *testing.T) {
	policy, err := NewRepoPolicy([]string{"FerryMigrator/Repo-One", "ferrymigrator/repo-two.git"})
	if err != nil {
		t.Fatalf("NewRepoPolicy() error = %v", err)
	}

	tests := []struct {
		name string
		repo string
		want bool
	}{
		{name: "full name", repo: "ferrymigrator/repo-one", want: true},
		{name: "URL", repo: "https://github.com/FerryMigrator/Repo-Two.git", want: true},
		{name: "other owner", repo: "someone/repo-one", want: false},
		{name: "extra path", repo: "ferrymigrator/repo-one/issues", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := policy.Allowed(tt.repo); got != tt.want {
				t.Fatalf("Allowed(%q) = %t, want %t", tt.repo, got, tt.want)
			}
		})
	}
}

func TestNewRepoPolicyRejectsMalformedRepo(t *testing.T) {
	if _, err := NewRepoPolicy([]string{"ferrymigrator/repo/extra"}); err == nil {
		t.Fatal("NewRepoPolicy() error = nil, want malformed repo error")
	}
}
