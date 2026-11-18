export const vendorRoot = '/prepare-file/210e2c2ef75fe79d';

const scripts = new Map<string, Promise<void>>();

export async function loadVendorScript(path: string) {
  let request = scripts.get(path);
  if (!request) {
    request = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${vendorRoot}/${path}`;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scripts.delete(path);
        reject(new Error('Could not load the file tool.'));
      };
      document.head.append(script);
    });
    scripts.set(path, request);
  }
  await request;
}
