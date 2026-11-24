package push

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"time"
)

// The two halves of a Web Push, with nothing but the standard library: the message
// encrypted so that only the browser can read it (RFC 8291), and a signed note to the
// push service saying who is sending (VAPID, RFC 8292).

var b64 = base64.RawURLEncoding

// recordSize is the one record a push message fits in. Ours are under a kilobyte.
const recordSize = 4096

// encrypt seals plaintext for the browser whose subscription holds ua and auth. sender
// is a key pair used for this one message, and salt 16 random bytes; they are arguments
// so that the RFC's example can be checked to the byte.
func encrypt(plaintext []byte, ua *ecdh.PublicKey, auth []byte, sender *ecdh.PrivateKey, salt []byte) ([]byte, error) {
	shared, err := sender.ECDH(ua)
	if err != nil {
		return nil, fmt.Errorf("agree a key: %w", err)
	}
	as := sender.PublicKey().Bytes()
	// RFC 8291 section 3.4: the shared secret is mixed with the subscription's auth secret
	// and both public keys, so a push service that swapped a key would get nothing.
	info := append(append([]byte("WebPush: info\x00"), ua.Bytes()...), as...)
	ikm, err := hkdf.Key(sha256.New, shared, auth, string(info), 32)
	if err != nil {
		return nil, err
	}
	// RFC 8188: the content key and the nonce both come from that and the salt.
	key, err := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: aes128gcm\x00", 16)
	if err != nil {
		return nil, err
	}
	nonce, err := hkdf.Key(sha256.New, ikm, salt, "Content-Encoding: nonce\x00", 12)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	// The header: salt, record size, and our public key as the key id. Then the one
	// record, whose plaintext ends in 0x02: "this is the last record".
	out := append([]byte{}, salt...)
	out = binary.BigEndian.AppendUint32(out, recordSize)
	out = append(append(out, byte(len(as))), as...)
	return gcm.Seal(out, nonce, append(append([]byte{}, plaintext...), 2), nil), nil
}

// seal is encrypt with a fresh key pair and salt, as every real message has.
func seal(plaintext []byte, ua *ecdh.PublicKey, auth []byte) ([]byte, error) {
	sender, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	salt := make([]byte, 16)
	rand.Read(salt)
	return encrypt(plaintext, ua, auth, sender, salt)
}

// vapid is the Authorization header that tells a push service this message comes from
// the server the browser subscribed to: a JWT signed with our key, naming the push
// service (aud) and somebody to write to about it (sub).
func vapid(key *ecdsa.PrivateKey, audience, contact string, now time.Time) (string, error) {
	header := b64.EncodeToString([]byte(`{"typ":"JWT","alg":"ES256"}`))
	claims, err := json.Marshal(map[string]any{"aud": audience, "exp": now.Add(12 * time.Hour).Unix(), "sub": contact})
	if err != nil {
		return "", err
	}
	signed := header + "." + b64.EncodeToString(claims)
	digest := sha256.Sum256([]byte(signed))
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		return "", fmt.Errorf("sign vapid: %w", err)
	}
	// ES256 in a JWT is r and s, 32 bytes each, side by side. Not ASN.1.
	signature := make([]byte, 64)
	r.FillBytes(signature[:32])
	s.FillBytes(signature[32:])
	public, err := key.PublicKey.ECDH()
	if err != nil {
		return "", err
	}
	return "vapid t=" + signed + "." + b64.EncodeToString(signature) + ", k=" + b64.EncodeToString(public.Bytes()), nil
}
