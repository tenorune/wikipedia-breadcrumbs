<script lang="ts">
  import { PUBLIC_CONTACT_EMAIL } from "$env/static/public";
</script>

<div class="privacy">
<h1>Privacy Policy</h1>
<p class="updated">Last updated: April 5, 2026</p>

<p>Wikipedia Breadcrumbs ("the Service") is a browser extension and progressive web app that helps you track and organize your Wikipedia browsing trails. This policy explains what data we collect, how we use it, and your rights.</p>

<h2>What we collect</h2>

<h3>Account information</h3>
<p>When you sign in with Google, we collect your email address to identify your account and enable cloud sync. When you sign in with Wikimedia, we do not collect your email address or display name — your account is identified by an anonymous internal identifier.</p>

<h3>Wikipedia browsing history</h3>
<p>The extension records Wikipedia pages you visit, including the page URL, article title, language, and time of visit. This data is only collected from Wikipedia (*.wikipedia.org) and no other websites.</p>

<h3>User-created content</h3>
<p>You may add names and notes to your trails and visits. This content is stored alongside your browsing history.</p>

<h2>How we store your data</h2>

<p>Your data is stored locally on your device using IndexedDB. If you enable cloud sync and sign in, your data is also stored in our cloud database (hosted by Supabase) to enable access across devices.</p>

<p>Data in transit is encrypted via HTTPS. Cloud data is protected by row-level security policies that ensure you can only access your own data.</p>

<h2>How we use your data</h2>

<p>Your data is used exclusively to provide the Service. We do not:</p>
<ul>
  <li>Sell your data to third parties</li>
  <li>Use your data for advertising</li>
  <li>Share your data with third parties beyond the infrastructure providers necessary to operate the Service (Supabase for database, Firebase for hosting, Google and Wikimedia for authentication)</li>
  <li>Use your data for analytics or tracking beyond the Service itself</li>
</ul>

<h2>Data retention and deletion</h2>

<p>Your data is retained as long as you use the Service. You can delete your local data at any time through the Settings page. If you sign out, your cloud-synced data remains in the database until you request deletion.</p>

<p>To request complete deletion of your cloud data, contact us at the email below.</p>

<h2>Third-party services</h2>

<ul>
  <li><strong>Supabase</strong> — cloud database and authentication (<a href="https://supabase.com/privacy">supabase.com/privacy</a>)</li>
  <li><strong>Firebase</strong> — web hosting (<a href="https://firebase.google.com/support/privacy">firebase.google.com/support/privacy</a>)</li>
  <li><strong>Google OAuth</strong> — optional sign-in provider (<a href="https://policies.google.com/privacy">policies.google.com/privacy</a>)</li>
  <li><strong>Wikimedia OAuth</strong> — optional sign-in provider (<a href="https://foundation.wikimedia.org/wiki/Privacy_policy">foundation.wikimedia.org/wiki/Privacy_policy</a>)</li>
</ul>

<h2>Your rights</h2>

<p>You can:</p>
<ul>
  <li>Export your data at any time via the export feature in the extension or PWA</li>
  <li>Delete your local data through Settings</li>
  <li>Request deletion of your cloud data by contacting us</li>
  <li>Stop data collection by disabling or uninstalling the extension</li>
</ul>

<h2>Changes to this policy</h2>

<p>We may update this policy from time to time. Changes will be reflected by the "Last updated" date at the top of this page.</p>

<h2>Contact</h2>

<p>For questions about this privacy policy or to request data deletion, contact: <a href="mailto:{PUBLIC_CONTACT_EMAIL}">{PUBLIC_CONTACT_EMAIL}</a></p>
</div>

<style>
  .privacy {
    max-width: 640px;
    margin: 0 auto;
    padding: 20px;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
  }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
  h2 { font-size: 16px; font-weight: 600; margin: 24px 0 8px; }
  h3 { font-size: 14px; font-weight: 600; margin: 16px 0 4px; }
  .updated { font-size: 12px; color: #888; margin: 0 0 16px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  a { color: #0066cc; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
