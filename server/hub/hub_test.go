package hub

import (
	"context"
	"errors"
	"testing"
)

// The fan-out itself is tested over real sockets in cmd/heirloomd. What cannot be
// arranged there is a device that stops reading, so its queue is filled by hand here.

func stalled() (*conn, context.Context) {
	ctx, cancel := context.WithCancelCause(context.Background())
	return &conn{cancel: cancel, out: make(chan []byte, queueFrames)}, ctx
}

func TestQueueIsBoundedInFrames(t *testing.T) {
	c, ctx := stalled()
	for range queueFrames {
		c.send([]byte(`{"type":"cells"}`))
	}
	if ctx.Err() != nil {
		t.Fatalf("closed with %d frames waiting: that many are allowed", queueFrames)
	}
	c.send([]byte(`{"type":"cells"}`))
	if !errors.Is(context.Cause(ctx), errSlow) {
		t.Errorf("one frame past the bound: %v, want the socket closed as too slow", context.Cause(ctx))
	}
	if len(c.out) != queueFrames {
		t.Errorf("%d frames queued, want the bound of %d", len(c.out), queueFrames)
	}
}

func TestQueueIsBoundedInBytes(t *testing.T) {
	c, ctx := stalled()
	frame := make([]byte, 1<<20)
	for range queueBytes / len(frame) {
		c.send(frame)
	}
	if ctx.Err() != nil {
		t.Fatalf("closed with %d bytes waiting: that many are allowed", queueBytes)
	}
	c.send(frame)
	if !errors.Is(context.Cause(ctx), errSlow) {
		t.Errorf("one frame past %d bytes: %v, want the socket closed as too slow", queueBytes, context.Cause(ctx))
	}
	if len(c.out) != queueBytes/len(frame) {
		t.Errorf("%d frames queued: the one over the bound must not be kept", len(c.out))
	}
}

func TestStartFrom(t *testing.T) {
	for _, c := range [][3]int64{{0, 0, 0}, {5, 9, 5}, {9, 9, 9}, {10, 9, 0}} {
		if got := startFrom(c[0], c[1]); got != c[2] {
			t.Errorf("startFrom(cursor %d, head %d) = %d, want %d", c[0], c[1], got, c[2])
		}
	}
}
