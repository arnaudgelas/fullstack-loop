package com.example.loop.support;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;

/**
 * The RSA key material the auth tests run against, generated in-process.
 *
 * <p>Nothing here reads {@code dev-keys/}: the tests are self-contained, so they
 * pass on a machine where nobody has run {@code scripts/gen-dev-keys.sh}. The
 * public half of the trusted pair is written to a temporary PEM that the
 * application is pointed at through
 * {@code spring.security.oauth2.resourceserver.jwt.public-key-location}.
 *
 * <p>A second, unrelated pair backs the "signed by the wrong key" case, so that
 * rejection is a genuinely different signature rather than a mangled string.
 */
public final class EphemeralRsaKeys {

    /** The pair the provider is configured to trust. */
    public static final KeyPair TRUSTED = generateKeyPair();

    /** A pair the provider knows nothing about. */
    public static final KeyPair UNTRUSTED = generateKeyPair();

    private static final int RSA_KEY_SIZE_BITS = 2048;
    private static final int PEM_LINE_LENGTH = 64;
    private static final Path PUBLIC_KEY_PEM = writePublicKeyPem();

    private EphemeralRsaKeys() {}

    /**
     * Spring resource location of the trusted public key, for
     * {@code @DynamicPropertySource}.
     *
     * @return a {@code file:} URL pointing at the trusted public key
     */
    public static String publicKeyLocation() {
        return "file:" + PUBLIC_KEY_PEM.toAbsolutePath();
    }

    private static KeyPair generateKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(RSA_KEY_SIZE_BITS);
            return generator.generateKeyPair();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("RSA unavailable", e);
        }
    }

    private static Path writePublicKeyPem() {
        RSAPublicKey publicKey = (RSAPublicKey) TRUSTED.getPublic();
        String body = Base64.getMimeEncoder(PEM_LINE_LENGTH, new byte[] {'\n'}).encodeToString(publicKey.getEncoded());
        String pem = "-----BEGIN PUBLIC KEY-----\n" + body + "\n-----END PUBLIC KEY-----\n";
        try {
            Path file = Files.createTempFile("loop-test-jwt-public", ".pem");
            file.toFile().deleteOnExit();
            Files.writeString(file, pem, StandardCharsets.UTF_8);
            return file;
        } catch (IOException e) {
            throw new UncheckedIOException("could not write test public key", e);
        }
    }
}
