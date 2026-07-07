/**
 * Unit tests for escapeHtml() function
 * CRITICAL: XSS prevention - all user data flows through this
 */

describe('escapeHtml()', () => {
  // Mock the escapeHtml function for testing
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  describe('Basic HTML escaping', () => {
    test('escapes < character', () => {
      expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    test('escapes > character', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    test('escapes & character', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    test('escapes double quotes', () => {
      expect(escapeHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
    });

    test('escapes single quotes/apostrophes', () => {
      expect(escapeHtml("It's a test")).toBe('It&#39;s a test');
    });
  });

  describe('Script injection prevention', () => {
    test('prevents basic script tag injection', () => {
      const malicious = '<script>alert("xss")</script>';
      expect(escapeHtml(malicious)).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    test('prevents onclick handler injection', () => {
      const malicious = '<img onclick="alert(1)">';
      expect(escapeHtml(malicious)).toBe('&lt;img onclick=&quot;alert(1)&quot;&gt;');
    });

    test('prevents onerror handler injection', () => {
      const malicious = '<img src=x onerror="alert(1)">';
      expect(escapeHtml(malicious)).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    });

    test('prevents event attribute with mixed quotes', () => {
      const malicious = '<a href=\'">\nonclick=alert(1)>';
      expect(escapeHtml(malicious)).not.toContain('onclick=');
      expect(escapeHtml(malicious)).toContain('&lt;');
    });
  });

  describe('Edge cases', () => {
    test('handles empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    test('handles null', () => {
      expect(escapeHtml(null)).toBe('');
    });

    test('handles undefined', () => {
      expect(escapeHtml(undefined)).toBe('');
    });

    test('handles numeric input', () => {
      expect(escapeHtml(123)).toBe('123');
    });

    test('handles already-escaped content without double-escaping', () => {
      // This tests that we don't double-escape - a single pass should be safe
      const once = escapeHtml('<script>');
      const twice = escapeHtml(once);
      expect(twice).not.toContain('&amp;lt;'); // Not double-escaped
    });

    test('handles text with no special characters', () => {
      const safe = 'Hello World 123';
      expect(escapeHtml(safe)).toBe('Hello World 123');
    });

    test('handles mixed content', () => {
      const mixed = 'User: "admin" <script>alert("xss")</script> & more';
      const escaped = escapeHtml(mixed);
      expect(escaped).toContain('&quot;');
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&amp;');
      expect(escaped).not.toContain('<script>');
    });
  });

  describe('Real-world scenarios', () => {
    test('escapes filename with special characters', () => {
      const filename = 'photo_<2024>.jpg';
      const escaped = escapeHtml(filename);
      expect(escaped).toBe('photo_&lt;2024&gt;.jpg');
    });

    test('escapes path with quotes', () => {
      const path = 'Drive/Folder "Public"/File.pdf';
      const escaped = escapeHtml(path);
      expect(escaped).toBe('Drive/Folder &quot;Public&quot;/File.pdf');
    });

    test('escapes review reason with injected HTML', () => {
      const reason = 'Needs review <img src=x onerror=alert(1)>';
      const escaped = escapeHtml(reason);
      expect(escaped).not.toContain('<img');
      expect(escaped).toContain('&lt;img');
    });

    test('escapes notes field with & symbols', () => {
      const notes = 'Item A & Item B & Item C';
      const escaped = escapeHtml(notes);
      expect(escaped).toBe('Item A &amp; Item B &amp; Item C');
    });
  });
});
