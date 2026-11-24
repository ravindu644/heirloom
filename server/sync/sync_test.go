package sync

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"heirloom/server/store"
)

// The fixtures and these tests write stamps around 2026-11-24T04:30Z. The server's clock
// starts a day later, so none of them trips the drift rule unless a test means it to.
var serverTime = time.Date(2026, 11, 25, 4, 30, 0, 0, time.UTC)

type world struct {
	*Store
	db  *sql.DB
	dir string
	now time.Time
}

func newWorld(t *testing.T) *world {
	t.Helper()
	w := &world{dir: t.TempDir(), now: serverTime}
	w.open(t)
	return w
}

func (w *world) open(t *testing.T) {
	t.Helper()
	db, err := store.Open(w.dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	w.db, w.Store = db, New(db, func() time.Time { return w.now })
}

func (w *world) account(t *testing.T, name string) int64 {
	t.Helper()
	res, err := w.db.Exec("insert into account (public_id, username, password, created) values (?, ?, '', 0)", name, name)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

// stamp makes a stamp second seconds after 04:30:00 on the fixtures' day.
func stamp(second int, device string) string {
	return fmt.Sprintf("2026-11-24T04:30:%02d.000Z-0000-%s", second, device)
}

const deviceA, deviceB = "a1b2c3d4e5f60718", "b2c3d4e5f6071829"

func cell(stamp, dataset, row, field, value string) json.RawMessage {
	return json.RawMessage(fmt.Sprintf(`{"stamp":%q,"dataset":%q,"row":%q,"field":%q,"value":%s}`, stamp, dataset, row, field, value))
}

func (w *world) push(t *testing.T, account int64, cells ...json.RawMessage) Pushed {
	t.Helper()
	p, err := w.Push(account, cells)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// everything walks the pages from 0, as a fresh device would.
func (w *world) everything(t *testing.T, account int64) []Cell {
	t.Helper()
	var all []Cell
	for cursor := int64(0); ; {
		page, err := w.Pull(account, cursor)
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Cells) == 0 {
			return all
		}
		all, cursor = append(all, page.Cells...), page.To
	}
}

func (w *world) stored(t *testing.T) (n int) {
	t.Helper()
	if err := w.db.QueryRow("select count(*) from cell").Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func (w *world) head(t *testing.T, account int64) int64 {
	t.Helper()
	head, err := w.Head(account)
	if err != nil {
		t.Fatal(err)
	}
	return head
}

// plain turns cells into something that compares by meaning: a value's key order and
// spacing do not matter, its content does.
func plain(t *testing.T, cells []Cell) map[string]any {
	t.Helper()
	out := map[string]any{}
	for _, c := range cells {
		var v any
		if err := json.Unmarshal(c.Value, &v); err != nil {
			t.Fatal(err)
		}
		key := c.Dataset + "/" + c.Row + "/" + c.Field
		if _, twice := out[key]; twice {
			t.Fatalf("two cells for %s", key)
		}
		out[key] = []any{c.Stamp, v}
	}
	return out
}

type fixtures struct {
	Merge []struct {
		Name   string
		Cells  []json.RawMessage
		Expect []Cell
	}
	Drift []struct {
		Name       string
		ServerTime int64 `json:"server_time"`
		Stamp      string
		Accept     bool
	}
}

func readFixtures(t *testing.T) fixtures {
	t.Helper()
	data, err := os.ReadFile("../../contracts/fixtures/merge.json")
	if err != nil {
		t.Fatal(err)
	}
	var f fixtures
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Merge) == 0 || len(f.Drift) == 0 {
		t.Fatal("merge.json has no merge or no drift cases: the fixture moved or changed shape")
	}
	return f
}

// orders is the given order, its reverse, and every order when there are six or fewer
// (protocol.md section 9).
func orders(n int) [][]int {
	given := make([]int, n)
	for i := range given {
		given[i] = i
	}
	reverse := slices.Clone(given)
	slices.Reverse(reverse)
	out := [][]int{given, reverse}
	if n > 6 {
		return out
	}
	var permute func(k int)
	permute = func(k int) {
		if k == n {
			out = append(out, slices.Clone(given))
			return
		}
		for i := k; i < n; i++ {
			given[k], given[i] = given[i], given[k]
			permute(k + 1)
			given[k], given[i] = given[i], given[k]
		}
	}
	permute(0)
	return out
}

// The contract's merge cases, through the real store: each cell arrives as its own push,
// in every order the contract asks for, and the account must end with exactly `expect`.
func TestFixtureMerge(t *testing.T) {
	w := newWorld(t)
	for _, c := range readFixtures(t).Merge {
		t.Run(c.Name, func(t *testing.T) {
			want := plain(t, c.Expect)
			for i, order := range orders(len(c.Cells)) {
				account := w.account(t, fmt.Sprintf("%s-%d", c.Name, i))
				for _, k := range order {
					w.push(t, account, c.Cells[k])
				}
				if got := plain(t, w.everything(t, account)); !reflect.DeepEqual(got, want) {
					t.Fatalf("order %v ended with\n%v\nwant\n%v", order, got, want)
				}
			}
		})
	}
}

func TestFixtureDrift(t *testing.T) {
	for _, c := range readFixtures(t).Drift {
		if got := Acceptable(c.Stamp, time.UnixMilli(c.ServerTime)); got != c.Accept {
			t.Errorf("%s: Acceptable = %v, want %v", c.Name, got, c.Accept)
		}
	}
}

func TestPushThenPullByCursor(t *testing.T) {
	w := newWorld(t)
	a := w.account(t, "ravi")
	p := w.push(t, a,
		cell(stamp(1, deviceA), "task", "t1", "title", `"one"`),
		cell(stamp(2, deviceA), "task", "t1", "done", `false`),
		cell(stamp(3, deviceA), "task", "t2", "title", `"two"`))
	if p.From != 0 || p.Cursor != 3 || len(p.Won) != 3 {
		t.Fatalf("first push = from %d cursor %d won %d, want 0, 3, 3", p.From, p.Cursor, len(p.Won))
	}
	for cursor, want := range map[int64][]string{0: {"one", "false", "two"}, 2: {"two"}, 3: {}} {
		page, err := w.Pull(a, cursor)
		if err != nil {
			t.Fatal(err)
		}
		var got []string
		for _, c := range page.Cells {
			got = append(got, strings.Trim(string(c.Value), `"`))
		}
		if !slices.Equal(got, want) || page.To != 3 {
			t.Errorf("pull after %d = %v to %d, want %v to 3", cursor, got, page.To, want)
		}
		if page.Cells == nil {
			t.Errorf("pull after %d gave nil cells: the reply would say null, not []", cursor)
		}
	}
}

func TestSameBatchTwiceChangesNothing(t *testing.T) {
	w := newWorld(t)
	a := w.account(t, "ravi")
	batch := []json.RawMessage{
		cell(stamp(1, deviceA), "task", "t1", "title", `"one"`),
		cell(stamp(2, deviceA), "task", "t1", "done", `false`),
	}
	w.push(t, a, batch...)
	before := w.everything(t, a)
	again := w.push(t, a, batch...)
	if again.From != 2 || again.Cursor != 2 || len(again.Won) != 0 {
		t.Errorf("second push = from %d cursor %d won %d, want 2, 2, 0", again.From, again.Cursor, len(again.Won))
	}
	if after := w.everything(t, a); !reflect.DeepEqual(before, after) {
		t.Errorf("the store changed:\n%v\n%v", before, after)
	}
}

func TestLosingCellGetsNoNumber(t *testing.T) {
	w := newWorld(t)
	a := w.account(t, "ravi")
	w.push(t, a, cell(stamp(5, deviceB), "task", "t1", "title", `"newer"`))
	lost := w.push(t, a, cell(stamp(4, deviceA), "task", "t1", "title", `"older"`))
	if lost.From != 1 || lost.Cursor != 1 || len(lost.Won) != 0 {
		t.Errorf("losing push = from %d cursor %d won %d, want 1, 1, 0: it must not be sent on", lost.From, lost.Cursor, len(lost.Won))
	}
	got := w.everything(t, a)
	if len(got) != 1 || string(got[0].Value) != `"newer"` || w.head(t, a) != 1 {
		t.Errorf("store = %v head %d, want only the newer cell at 1", got, w.head(t, a))
	}
}

// The ack's from and cursor must fence in the batch's own cells and nothing else, also
// when another device's batch landed just before and one cell of ours lost.
func TestPushBracketsItsOwnNumbers(t *testing.T) {
	w := newWorld(t)
	a := w.account(t, "ravi")
	w.push(t, a,
		cell(stamp(9, deviceB), "task", "t1", "title", `"theirs, later"`),
		cell(stamp(1, deviceB), "task", "t9", "title", `"theirs"`))
	ours := w.push(t, a,
		cell(stamp(2, deviceA), "task", "t2", "title", `"ours 1"`),
		cell(stamp(3, deviceA), "task", "t1", "title", `"ours, beaten"`),
		cell(stamp(4, deviceA), "task", "t3", "title", `"ours 2"`))
	if ours.From != 2 || ours.Cursor != 4 {
		t.Fatalf("push = from %d cursor %d, want 2 and 4", ours.From, ours.Cursor)
	}
	page, err := w.Pull(a, ours.From)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(page.Cells, ours.Won) || len(ours.Won) != 2 || page.To != ours.Cursor {
		t.Errorf("after from: %v to %d, want exactly what the batch won: %v to %d", page.Cells, page.To, ours.Won, ours.Cursor)
	}
}

func refusal(t *testing.T, err error) string {
	t.Helper()
	var r *Refused
	if !errors.As(err, &r) {
		t.Fatalf("got %v, want a refusal", err)
	}
	return r.Reason
}

func TestClockNackStoresNothing(t *testing.T) {
	w := newWorld(t)
	a := w.account(t, "ravi")
	ahead := w.now.Add(5*time.Minute + time.Millisecond).Format(stampTime)
	edge := w.now.Add(5 * time.Minute).Format(stampTime)
	_, err := w.Push(a, []json.RawMessage{
		cell(stamp(1, deviceA), "task", "t1", "title", `"fine"`),
		cell(ahead+"-0000-"+deviceA, "task", "t2", "title", `"from the future"`),
		cell(stamp(2, deviceA), "task", "t3", "title", `"fine too"`),
	})
	if reason := refusal(t, err); reason != "clock" {
		t.Errorf("reason = %q, want clock", reason)
	}
	if w.stored(t) != 0 || w.head(t, a) != 0 {
		t.Errorf("a refused batch left %d cells, head %d: one bad cell must stop all of it", w.stored(t), w.head(t, a))
	}
	// Exactly five minutes ahead is still fine, and so is the same batch once the clock has moved.
	w.push(t, a, cell(edge+"-0000-"+deviceA, "task", "t4", "title", `"on the edge"`))
	w.now = w.now.Add(time.Millisecond)
	if p := w.push(t, a, cell(ahead+"-0000-"+deviceA, "task", "t2", "title", `"no longer the future"`)); len(p.Won) != 1 {
		t.Error("a stamp inside the window was not stored")
	}
}

func TestInvalidNackStoresNothing(t *testing.T) {
	good := cell(stamp(1, deviceA), "task", "t1", "title", `"fine"`)
	long := strings.Repeat("x", 65)
	many := make([]json.RawMessage, MaxCells+1)
	for i := range many {
		many[i] = cell(stamp(1, deviceA), "task", fmt.Sprintf("t%d", i), "title", `1`)
	}
	// One byte over 16 KB as JSON, and the largest that still fits.
	room := maxCell - len(cell(stamp(1, deviceA), "task", "t1", "note", `""`))
	fits := cell(stamp(1, deviceA), "task", "t1", "note", `"`+strings.Repeat("n", room)+`"`)
	tooBig := cell(stamp(1, deviceA), "task", "t1", "note", `"`+strings.Repeat("n", room+1)+`"`)
	if len(fits) != maxCell || len(tooBig) != maxCell+1 {
		t.Fatalf("test cells are %d and %d bytes, want %d and %d", len(fits), len(tooBig), maxCell, maxCell+1)
	}

	bad := map[string][]json.RawMessage{
		"a dataset with a space":     {good, cell(stamp(2, deviceA), "my task", "t1", "title", `1`)},
		"a dataset with a dot":       {good, cell(stamp(2, deviceA), "task.x", "t1", "title", `1`)},
		"an empty row":               {good, cell(stamp(2, deviceA), "task", "", "title", `1`)},
		"a field of 65 characters":   {good, cell(stamp(2, deviceA), "task", "t1", long, `1`)},
		"no value":                   {good, json.RawMessage(fmt.Sprintf(`{"stamp":%q,"dataset":"task","row":"t1","field":"title"}`, stamp(2, deviceA)))},
		"a key the protocol lacks":   {good, json.RawMessage(fmt.Sprintf(`{"stamp":%q,"dataset":"task","row":"t1","field":"title","value":1,"ttl":9}`, stamp(2, deviceA)))},
		"a cell that is not a cell":  {good, json.RawMessage(`"task"`)},
		"a null cell":                {good, json.RawMessage(`null`)},
		"a stamp without a counter":  {good, cell("2026-11-24T04:30:00.000Z-a1b2c3d4e5f60718", "task", "t1", "title", `1`)},
		"a stamp in upper case hex":  {good, cell("2026-11-24T04:30:00.000Z-0000-A1B2C3D4E5F60718", "task", "t1", "title", `1`)},
		"a stamp with no such day":   {good, cell("2026-02-30T04:30:00.000Z-0000-a1b2c3d4e5f60718", "task", "t1", "title", `1`)},
		"a stamp in local time":      {good, cell("2026-11-24T04:30:00.000+-0000-a1b2c3d4e5f60718", "task", "t1", "title", `1`)},
		"a stamp that sorts wrongly": {good, cell("2026-11-24 04:30:00.000Z-0000-a1b2c3d4e5f60718", "task", "t1", "title", `1`)},
		"a cell over 16 KB":          {good, tooBig},
		"a value that is not UTF-8":  {good, cell(stamp(2, deviceA), "task", "t1", "title", "\"caf\xe9\"")},
		"501 cells":                  many,
		// Broken and from the future at once: restamping would not save it, so it is invalid.
		"a bad name and a fast clock": {
			cell("2027-01-01T00:00:00.000Z-0000-"+deviceA, "task", "t1", "title", `1`),
			cell(stamp(2, deviceA), "task", "t 1", "title", `1`)},
	}
	w := newWorld(t)
	a := w.account(t, "ravi")
	for name, batch := range bad {
		_, err := w.Push(a, batch)
		if reason := refusal(t, err); reason != "invalid" {
			t.Errorf("%s: reason = %q, want invalid", name, reason)
		}
		if w.stored(t) != 0 {
			t.Fatalf("%s: the refused batch left %d cells behind", name, w.stored(t))
		}
	}

	// The limits themselves are allowed: 500 cells, 64 character names, 16 KB, a null value.
	w.push(t, a, many[:MaxCells]...)
	w.push(t, a, fits, cell(stamp(1, deviceA), long[:64], long[:64], long[:64], `null`))
	if got := w.stored(t); got != MaxCells+2 {
		t.Errorf("stored %d cells at the limits, want %d", got, MaxCells+2)
	}
}

func TestPullPagesAt500(t *testing.T) {
	w := newWorld(t)
	a := w.account(t, "ravi")
	for batch := range 3 {
		cells := make([]json.RawMessage, 400)
		for i := range cells {
			cells[i] = cell(stamp(1, deviceA), "task", fmt.Sprintf("t%d-%d", batch, i), "title", `1`)
		}
		w.push(t, a, cells...)
	}
	var sizes []int
	for cursor := int64(0); ; {
		page, err := w.Pull(a, cursor)
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Cells) == 0 {
			break
		}
		if want := cursor + int64(len(page.Cells)); page.To != want {
			t.Fatalf("page after %d ends at %d, want %d", cursor, page.To, want)
		}
		sizes, cursor = append(sizes, len(page.Cells)), page.To
	}
	if !slices.Equal(sizes, []int{500, 500, 200}) {
		t.Errorf("pages = %v, want 500, 500, 200", sizes)
	}
}

// 200 cells of 15 KB are 3 MB. A page stops near 1 MB so it never sits in memory whole,
// and walking the pages still reaches every cell.
func TestPullPagesStaySmall(t *testing.T) {
	w := newWorld(t)
	a := w.account(t, "ravi")
	note := `"` + strings.Repeat("n", 15<<10) + `"`
	for batch := range 4 {
		cells := make([]json.RawMessage, 50)
		for i := range cells {
			cells[i] = cell(stamp(1, deviceA), "task", fmt.Sprintf("t%d-%d", batch, i), "note", note)
		}
		w.push(t, a, cells...)
	}
	page, err := w.Pull(a, 0)
	if err != nil {
		t.Fatal(err)
	}
	if n := len(page.Cells); n < 1 || n*len(note) > maxPage+maxCell {
		t.Errorf("first page holds %d cells of %d bytes, want about 1 MB", n, len(note))
	}
	if got := len(w.everything(t, a)); got != 200 {
		t.Errorf("walking the pages found %d cells, want 200", got)
	}
}

func TestCellSurvivesRestart(t *testing.T) {
	w := newWorld(t)
	a := w.account(t, "ravi")
	w.push(t, a, cell(stamp(1, deviceA), "session", "run-1", "ended", `1795494600000`))
	before := w.everything(t, a)
	if err := w.db.Close(); err != nil {
		t.Fatal(err)
	}
	w.open(t)
	if after := w.everything(t, a); len(after) != 1 || !reflect.DeepEqual(before, after) || w.head(t, a) != 1 {
		t.Errorf("after reopening: %v head %d, want %v head 1", after, w.head(t, a), before)
	}
	// And the sequence carries on from where it was.
	if p := w.push(t, a, cell(stamp(2, deviceA), "session", "run-2", "ended", `1`)); p.From != 1 || p.Cursor != 2 {
		t.Errorf("first push after reopening = from %d cursor %d, want 1 and 2", p.From, p.Cursor)
	}
}

// A dataset and a field this build has never heard of, with values a careless server
// would mangle: a number past float64, characters JSON encoders like to escape, a null.
func TestUnknownDatasetAndFieldPassThrough(t *testing.T) {
	w := newWorld(t)
	a := w.account(t, "ravi")
	values := []string{
		`{"level":3,"note":"<b>tired</b> & happy","big":12345678901234567890123,"tiny":1e-400,"nested":[null,{"a":[]}]}`,
		`null`,
		`"ප්‍රගතිය 🌱"`,
	}
	for i, v := range values {
		w.push(t, a, cell(stamp(i+1, deviceA), "mood", "2026-11-24", fmt.Sprintf("future_field_%d", i), v))
	}
	got := w.everything(t, a)
	if len(got) != len(values) {
		t.Fatalf("stored %d cells, want %d", len(got), len(values))
	}
	for i, c := range got {
		if string(c.Value) != values[i] || c.Dataset != "mood" || c.Field != fmt.Sprintf("future_field_%d", i) {
			t.Errorf("cell %d came back as %s.%s = %s, want the bytes that went in: %s", i, c.Dataset, c.Field, c.Value, values[i])
		}
	}
}

func TestAccountsAreWalls(t *testing.T) {
	w := newWorld(t)
	ravi, sam := w.account(t, "ravi"), w.account(t, "sam")
	// The same row and field in both accounts, and the older stamp in the second: if the
	// wall leaked, Sam's cell would lose to Ravi's and vanish.
	w.push(t, ravi, cell(stamp(9, deviceA), "settings", "current", "theme", `"dark"`), cell(stamp(1, deviceA), "task", "t1", "title", `"Ravi's"`))
	p := w.push(t, sam, cell(stamp(1, deviceB), "settings", "current", "theme", `"light"`))
	if p.From != 0 || p.Cursor != 1 || len(p.Won) != 1 {
		t.Errorf("Sam's first push = from %d cursor %d won %d: sequence numbers are per account, want 0, 1, 1", p.From, p.Cursor, len(p.Won))
	}
	for account, want := range map[int64][]string{ravi: {`"dark"`, `"Ravi's"`}, sam: {`"light"`}} {
		var got []string
		for _, c := range w.everything(t, account) {
			got = append(got, string(c.Value))
		}
		if !slices.Equal(got, want) {
			t.Errorf("account %d sees %v, want %v", account, got, want)
		}
	}
}
