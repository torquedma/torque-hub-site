const TAXONOMY_TEST_DATA = { ok: true, marker: 'taxonomy-import-test' };

// Browser shim: expose on window when in a browser context.
if (typeof window !== 'undefined') {
  window.TAXONOMY_TEST = TAXONOMY_TEST_DATA;
}

// Module export: for edge/Node/check-script consumption.
export const TAXONOMY_TEST = TAXONOMY_TEST_DATA;
