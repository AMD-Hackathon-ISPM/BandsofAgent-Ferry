package band

import "testing"

func TestRunCtxGuestRoundTrip(t *testing.T) {
	want := RunCtx{Repo: "ferrymigrator/repo", User: "user", Run: "run", IsGuest: true}
	got, ok := ParseCtx(MarshalCtx(want))
	if !ok {
		t.Fatal("ParseCtx() ok = false, want true")
	}
	if !got.IsGuest {
		t.Fatal("ParseCtx().IsGuest = false, want true")
	}
}
