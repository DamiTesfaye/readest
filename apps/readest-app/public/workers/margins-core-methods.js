export const coreMethods = (core) => ({
  loadBook: (fileHash, sections) => core.load_book(fileHash, JSON.stringify(sections)),
  canonicalSection: (fileHash, section) => JSON.parse(core.canonical_section(fileHash, section)),
  fingerprint: (fileHash) => JSON.parse(core.fingerprint(fileHash)),
  buildAnchor: (fileHash, req) => JSON.parse(core.build_anchor(fileHash, JSON.stringify(req))),
  resolve: (fileHash, anchor, sameFile, otherFileInFamily) =>
    JSON.parse(
      core.resolve(fileHash, JSON.stringify(anchor), JSON.stringify(sameFile), otherFileInFamily),
    ),
  toRaw: (fileHash, section, canonByte) => JSON.parse(core.to_raw(fileHash, section, canonByte)),
  fromRaw: (fileHash, section, run, utf16) => core.from_raw(fileHash, section, run, utf16),
  mapOffset: (from, to, fromUtf16) => core.map_offset(from, to, fromUtf16),
});

export const answer = (methods, { id, method, args }) => {
  try {
    if (!Object.hasOwn(methods, method)) throw new Error(`unknown method ${method}`);
    return { id, result: methods[method](...args) };
  } catch (error) {
    return { id, error: error instanceof Error ? error.message : String(error) };
  }
};
