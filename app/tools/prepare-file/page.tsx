import { publicPageMetadata } from '@/components/jobs/job-sharing';
import {
  RESIZE_DESCRIPTION,
  RESIZE_PATH,
  RESIZE_TITLE,
} from '@/lib/prepare-file/seo';
import { PrepareFile } from './prepare-file';
import styles from './prepare-file.module.css';

export const metadata = publicPageMetadata({
  title: RESIZE_TITLE,
  description: RESIZE_DESCRIPTION,
  pathname: RESIZE_PATH,
});

export default function PrepareFilePage() {
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div>
          <h1>{RESIZE_TITLE}</h1>
          <p>Fit your photo, signature, or PDF to your form’s upload limit.</p>
        </div>
        <p className={styles.privacy}>
          Files stay on your device. Hodivo never uploads or stores them on its
          servers.
        </p>
      </header>
      <noscript>
        Enable JavaScript to prepare files directly in your browser.
      </noscript>
      <PrepareFile />
    </div>
  );
}
