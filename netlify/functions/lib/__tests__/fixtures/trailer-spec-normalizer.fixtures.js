// netlify/functions/lib/__tests__/fixtures/trailer-spec-normalizer.fixtures.js
//
// T1.2-C Stage 1a — Step 6a. FIXTURE ACQUISITION FILE.
//
// PROVENANCE: the 12 real bodies were pulled from Supabase (project bxsikkmqasydosmblzov,
// table `inventory`, column `raw_description`) on 2026-08-02 as base64:
//
//     select stock, length(raw_description), octet_length(raw_description),
//            encode(convert_to(raw_description,'UTF8'),'base64')
//     from inventory where stock in (...);
//
// Base64 — not rendered text — because these bodies carry characters that a browser grid,
// clipboard, or hand-retype destroys silently:
//   * HGR-S1253331 contains a literal TAB (the whole point of that fixture)
//   * HGR-S1254388 contains double-encoded mojibake (chars 603 != bytes 612)
//   * MPX-1KT3425 and ATT-024943 contain U+200B ZERO-WIDTH SPACES — invisible in every viewer
// Every body decoded and was verified against its recorded char and byte counts before landing here.
//
// WHAT THIS FILE DOES *NOT* CONTAIN: golden normalized output. `expectedFormat`,
// `expectedHandling`, and `expectedWarningCode` are CONTRACT-DERIVED — readable straight out of
// the Stage 1a design contract without executing anything. Grouped keyDetails, normalizedLine
// values, confidence, and schemaHint are OBSERVATIONS of the implementation and must not be
// frozen until real console output has been reviewed. That happens in Step 6b, not here.
//
// The `observed*` fields are computed from the BYTES ALONE (raw newline split), not from the
// normalizer. They are sanity anchors, not expectations. Note that splitLines() applies tab-split
// AND drops blank/whitespace-only lines, so its count will differ from rawNonEmptyLines —
// HGR-S1253331 in particular yields one MORE id than rawNonEmptyLines.
//
// sha256 (first 16 hex of the decoded UTF-8 string) is a DRIFT TRIPWIRE. It proves the fixture
// has not been hand-edited since capture. It does not prove DB provenance — the char/byte
// assertions did that at capture time.
//
// DO NOT EDIT ANY BODY. If a fixture disagrees with the implementation, the implementation or the
// contract is wrong — not the source bytes.
//
// Owning doc: 17iV9dYCMGlXFzBUTwLUvHMj31yDeOnFs3LnBom2Ahdo
// Acceptance standard (STAGE 2 oracle — NOT Stage 1a expected values):
//   1BTpY9Y4pe2Au_YAuKiXkVptY6SDTkHA6f5qjyCM8XpA

'use strict';

const FIXTURES = [
  {
    id: 1,
    stock: "HGR-T1260854",
    dealer: "HGR's Truck and Trailer",
    category: "Trailers",
    subcategory: "Equipment Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 825,
    bytes: 870,
    sha256: "c65967a4851d3c83",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "hgr_delimited",
    expectedHandling: "normalized",
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 21,
    rawDelimitedLines: 21,

    notes: "GOLDEN. Acceptance-standard unit (dx_locked=true). NO header line - starts directly at first bullet. 21 nonempty / 21 delimited: zero exclusions, zero leadProse expected. Does NOT exercise the HEADER exclusion rule.",

    b64: "wrcgICAgICAgICAyMOKAmSBGbGF0IERlY2ssIDXigJkgRG92ZXRhaWwgd2l0aCBGb2xkIE92ZXIgTW9uc3RlciBSYW1wcwoKwrcgICAgICAgICBDaGFyY29hbCBHcmV5IHdpdGggV2hpdGUgUGluIFN0cmlwZQoKwrcgICAgICAgICA3LDAwMCMgRVogTHViZSBBeGxlcyBMZWFmIFNwcmluZyBBeGxlcwoKwrcgICAgICAgICBTVDIzNS84MC9SMTYgTG9hZCBSYW5nZSBFIFJhZGlhbHMKCsK3ICAgICAgICAgUG93ZGVyY29hdCBCbGFjayBUcmFpbGVyIFdoZWVscwoKwrcgICAgICAgICAxMuKAnXgy4oCdIEJyYWtlcyBvbiBCb3RoIEF4bGVzIHcvIEVsZWN0cmljIEJyZWFrIEF3YXkKCsK3ICAgICAgICAgTG9ja2FibGUgQ2hhaW4gVHJheQoKwrcgICAgICAgICAoMikgMTJrIERyb3AgTGVnIEphY2tzCgrCtyAgICAgICAgIDLigLMgVHJlYXRlZCBQaW5lIEZsb29yCgrCtyAgICAgICAgIDEwMuKAnSBXaWRlCgrCtyAgICAgICAgIFNhZmV0eSBDaGFpbnMKCsK3ICAgICAgICAgMiA1LzE24oCzIEdvb3NlbmVjayBDb3VwbGVyCgrCtyAgICAgICAgIFNpZGUgU3RlcCB3aXRoIEhhbmRsZQoKwrcgICAgICAgICA3IHdheSBSViBSb3VuZCBQbHVnCgrCtyAgICAgICAgIFNlYWxlZCBXaXJpbmcgSGFybmVzcwoKwrcgICAgICAgICBELk8uVC4gTEVEIExpZ2h0aW5nLCBSdWJiZXIgTW91bnRlZAoKwrcgICAgICAgICAxNGxiIDEy4oCdIEliZWFtIG1haW4gZnJhbWUKCsK3ICAgICAgICAgMTRsYiAxMuKAnSBJYmVhbSBHb29zZW5lY2sKCsK3ICAgICAgICAgNuKAnSBDaGFubmVsIFNpZGUgUmFpbAoKwrcgICAgICAgICAz4oCdIENoYW5uZWwgQ3Jvc3NtZW1iZXJzIDE24oCdIE9uIENlbnRlcgoKwrcgICAgICAgICBTcGFyZSBNb3VudCB3aXRoIFNwYXJl",
  },
  {
    id: 2,
    stock: "HGR-S1253510",
    dealer: "HGR's Truck and Trailer",
    category: "Trailers",
    subcategory: "Utility Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 645,
    bytes: 645,
    sha256: "5f7234390a789216",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "hgr_delimited",
    expectedHandling: "normalized",
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 18,
    rawDelimitedLines: 17,

    notes: "Clean dash bullets, no traps. Header line present.",

    b64: "VFJBSUxFUlMgRk9SIEVWRVJZVEhJTkcgQU5EIEVWRVJZVEhJTkcgRk9SIFRSQUlMRVJTCgotMjQiIEVYUEFOREVEIE1FVEFMIFNJREVTCi0xLzQiIFNURUVMIENPTlNUUlVDVElPTgotMzUwMExCIEVaIExVQkUgTEVBRiBTUFJJTkcgQVhMRVMgV0lUSCBCUkFLRVMgT04gQUxMIFdIRUVMUwotU1QyMDUvNzUvUjE1IExPQUQgUkFOR0UgQyBSQURJQUwgVFJBSUxFUiBUSVJFUwotUE9XREVSQ09BVCBUUkFJTEVSIFdIRUVMUwotODIiIEJFVFdFRU4gRkVOREVSUwotMjAnIERFQ0sKLTI0IiBFWFBBTkRFRCBNRVRBTCBTSURFUyBXSVRIIFJPVU5EIFRVQlVMQVIgVE9QIFJBSUwKLVJFSU5GT1JDRUQgU1BMSVQgUkVBUiBHQVRFIFdJVEggRVhUUkEgVVBSSUdIVFMgQU5EIEhFQVZZIE1FU0gKLVNQUklORyBBU1NJU1QgRk9SIFJFQVIgR0FURVMKLTIiIFRSRUFURUQgUElORSBERUNLCi0oMylST1dTIE9GIERFQ0sgU0NSRVdTCi0ySyBEUk9QIExFRyBKQUNLCi1TUEFSRSBUSVJFIE1PVU5UIFdJVEggU1BBUkUKLUxFRCBMSUdIVElORwotKDcpV0FZIFBMVUcgV0lUSCBJTlNVTEFURUQgV0lSSU5HIFJVTiBUSFJPVUdIIEdST01NRVRTIFdFTERFRCBUTyBUSEUgRlJBTUUoTk8gSE9MRVMgQlVSTkVEIElOIFRIRSBGUkFNRSkKLTIgNS8xNiBDT1VQTEVS",
  },
  {
    id: 3,
    stock: "HGR-223168",
    dealer: "HGR's Truck and Trailer",
    category: "Trailers",
    subcategory: "Car Hauler Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 2310,
    bytes: 2310,
    sha256: "41b83ce3b5c5bc8d",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "hgr_delimited",
    expectedHandling: "normalized",
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 57,
    rawDelimitedLines: 53,

    notes: "Prose intro + dash bullets (lead-prose split). Contains a WRAPPED CONTINUATION line: '...AND FREEZER' / 'HANDLES'. 'HANDLES' is expected to fall to classifier rule 8 -> additional_features + UNCLASSIFIED warning. Correct lossless Stage 1a behavior; Stage 2 needs a continuation-merge rule.",

    b64: "VFJBSUxFUlMgRk9SIEVWRVJZVEhJTkcgQU5EIEVWRVJZVEhJTkcgRk9SIFRSQUlMRVJTCiAKVEhJUyBVTklURUQgVFJBSUxFUiBJUyBXT1JUSCBFVkVSWSBQRU5OWSEhISEgRVZFUllUSElORyBJUyBUSUdIVCBGUk9NIFRIRSBTQ1JFV0xFU1MgTUVUQUwgVE8gVEhFIEFOR0xFIFdPUksgVE8gVEhFIFNJTElDT05FIFdPUksuIE5PIENPUk5FUlMgSEFWRSBCRUVOIENVVCBPTiBUSEUgU1RSVUNUVVJFLiBUSElTIFRSQUlMRVIgSVMgUklHSFQhISEhIQogCk1PUkUgVU5JVEVEIFRSQUlMRVJTIFRPIENPTUUKIAotQUxVTUlOVU0gQ09OVFNUUlVDVElPTgotVUxUSU1BVEUgUk9BRFNJREUgRVNDQVBFIERPT1IKLTcyIiBCRUFWRVJUQUlMCi1XSElURSBXSVRIIEJMQUNLT1VUIFRSSU0gTCBTSEFQRSBCQVNFIEFORCBTVFJBSUdIVCBPVkVSSEVBRCBBTFVNSU5VTSBDQUJJTkVUUyBPTiBUSEUgRlJPTlQgV0FMTCBXSVRIIEZVTEwgQ0xPU0VUCi1SQUlTRSBVUCBET09SUyBPTiBVUFBFUiBDQUJJTkVUIFdJVEggR0FTIFNIT0NLUwotT1BFTklORyBJTiBCQVNFIENBQklORVQgRk9SIEZVVFVSRSBXSU5DSAotV0lOQ0ggUExBVEUKLTI0JyBGUk9NIFJFQVIgRE9PUiBUTyBFTkQgT0YgTCBTSEFQRSBCQVNFIENBQklORVQKLVNDUkVXTEVTUyBCTEFDSyAuMDMwIEVYVEVSSU9SIE1FVEFMCi0oMSkgUElFQ0UgQUxVTUlOVU0gUk9PRgotSEVBVlkgRFVUWSBUUlVDSyBCT0RZIFRPUCBXUkFQCi0yNCIgU1RPTkVHVUFSRAotSEVBVlkgRFVUWSA0IiBCT1RUT00gVFJJTSBXSVRIIFJFRCBBTkQgV0hJVEUgRE9UIFRBUEUKLVJFQVIgV0lORyBXSVRIIExPQURJTkcgTElHSFRTIEFORCBTVEVSRU8gU1BFQUtFUgotU1VQRVIgU1BSRUFEIEFYTEUgREVTSUdOKDU2IiBTUFJFQUQpCi1ERVhURVIgNzAwMExCIEVaIExVQkUgVE9SU0lPTiBBWExFUyBXSVRIIDEyIiBYIDIiIEJSQUtFUyBPTiBBTEwgV0hFRUxTCi1CTEFDSyBBTkQgU0lMVkVSIFNURVJMSU5HIEFMVU1JTlVNIFdIRUVMUwotU1RFUkxJTkcgU1QyMzUvODAvUjE2IExPQUQgUkFOR0UgRyBSQURJQUwgVFJBSUxFUiBUSVJFUwotMiJYOCJUUklQTEUgVFVCRSBUT05HVUUKLTgiIFRVQkUgRlJBTUUKLUVMRUNUUklDIFRPTkdVRSBKQUNLCi0xNiIgT04gQ0VOVEVSIFdBTEwgU1RVRFMKLTE2IiBPTiBDRU5URVIgUk9PRiBCT1dTCi0xNiIgT04gQ0VOVEVSIEZMT09SIENST1NTTUVNQkVSUwotNycgSU5TSURFIEhFSUdIVAotSEVBVlkgRFVUWSAzMiJYNzIiIFJWIFNJREUgRE9PUiBXSVRIIEZMVVNITE9DSyAoTk8gU0FHR0lORyBIQU5EIEJVSUxUIERPT1JTKQotU1BSSU5HIEFTU0lTVCBSRUFSIFJBTVAgV0lUSCBEVUFMIENBQkxFUyBBTkQgRlJFRVpFUgpIQU5ETEVTCi0xJyBBTFVNSU5VTSBGTEFQCi02JzEwIiBSRUFSIERPT1IgT1BFTklORyBIRUlHSFQKLTk0IiBSRUFSIERPT1IgT1BFTklORyBXSURUSAotNTBBTVAgRUxFQ1RSSUNBTCBQQUNLQUdFIFdJVEggTU9UT1JCQVNFIFBMVUcgQU5EIExJRkVMSU5FCi01MCBBTVAgUEFORUwgV0lUSCAxMiBWT0xUIENPTlZFUlRFUi9DSEFSR0VSCi1SRUNFU1NFRCBCQVRURVJZIEJPWCBXSVRIIDEyIFZPTFQgREVFUCBDWUNMRSBNQVJJTkUgQkFUVEVSWSBBTkQgS0lMTCBTV0lUQ0gKLVBMRU5UWSBPRiAxMiBWT0xUIExFRCBTVVJGQUNFIE1PVU5UIElOVEVSSU9SIExJR0hUUwotKDQpMTEwIFZPTFQgSU5URVJJT1IgUkVDRVBUUwotKDEpMTEwIFZPTFQgRVhURVJJT1IgUkVDRVBUCi1BTS9GTS9DRCBTVEVSRU8gU1lTVEVNIFdJVEggKDIpIElOVEVSSU9SIFNQRUFLRVJTIEFORCAoMikgRVhURVJJT1IgU1BFQUtFUlMKLTM2IiBYIDMwIiBMRUZUIEhBTkQgSElOR0UgU1dJTkcgT1BFTiBHRU5FUkFUT1IgRE9PUiBXSVRIIEZMVVNITE9DSwotU0NSRVdMRVNTIFdISVRFIEFMVU1JTlVNIENFSUxJTkcKLUJMQUNLIEFMVU1JTlVNIENPVkUgTU9MRElORwotSU5TVUxBVEVEIENFSUxJTkcKLTM2IiBNQVJJTkUgR1JBREUgQkxBQ0sgQ0FSUEVUIEtJQ0tQTEFURSBXSVRIIFNDUkVXTEVTUyBXSElURSBNRVRBTCBBQk9WRQotUFJFTUlVTSBCTEFDSyBSVUJCRVIgQ09JTiBGTE9PUklORyBJTkNMVURJTkcgUkFNUCBBTkQgRkxBUAotU1BBUkUgVElSRSBDT01QQVJUTUVOVAotKDgpNTAwMExCIFJFQ0VTU0VEIERSSU5HUwotUk9PRiBWRU5UCi1XSVJFIEFORCBCUkFDRSBGT1IgRlVUVVJFIEFJUiBDT05ESVRJT05JTkcKLUxFRCBDTEVBUkFOQ0UgTElHSFRTCi1MRUQgVEFJTExJR0hUUwotTUlEIFNISVAgVFVSTiBTSUdOQUxTCi1TSURFIE1PVU5UIFJFVkVSU0UgTElHSFRTCi0yIDUvMTYiIEJBTEwKLSg3KVdBWSBQTFVH",
  },
  {
    id: 4,
    stock: "HGR-TF112953",
    dealer: "HGR's Truck and Trailer",
    category: "Trailers",
    subcategory: "Concession Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 1155,
    bytes: 1159,
    sha256: "432ac3a7941337ee",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "hgr_delimited",
    expectedHandling: "normalized",
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 34,
    rawDelimitedLines: 33,

    notes: "Concession: interior/hvac/appliances groups + additional_features net. schemaHint expected 'concession'.",

    b64: "VFJBSUxFUlMgRk9SIEVWRVJZVEhJTkcgQU5EIEVWRVJZVEhJTkcgRk9SIFRSQUlMRVJTCgoKLTPigJkgWCA24oCZIEhFQVZZIERVVFkgVkVORE9SIERPT1IgV0lUSCBHQVMgU0hPQ0tTIENFTlRFUkVEIE9OIENVUkJTSURFCgotMzAgQU1QIDExMCBWT0xUIEVMRUNUUklDQUwgUEFDS0FHRSBXSVRIIE1PVE9SQkFTRSBQTFVHCgotKDIpMTEwIFZPTFQgTEVEIENFSUxJTkcgTElHSFRTIFdJVEggV0FMTCBTV0lUQ0gKCi0oNCkxMTAgVk9MVCBJTlRFUklPUiBSRUNFUFRTCgogCgotUkVBUiBTVEFCSUxJWkVSIEpBQ0tTCgotQUVST0RZTkFNSUMgVk5PU0UgV0lUSCBBTFVNSU5VTSBUUkVBRFBMQVRFIENPVkVSCgotLjA4MCBXSElURSBQT0xZQ09SRSBFWFRFUklPUiBNRVRBTCBXSVRIIFNDUkVXUyBBVCBUSEUgU0VBTVMgT05MWQoKLSgxKSBQSUVDRSBBTFVNSU5VTSBST09GCgotMjQiIFNUT05FR1VBUkQKCi1IRUFWWSBEVVRZIEJPVFRPTSBUUklNCgotVVBHUkFERUQgVE8gRVhUUkEgSEVJR0hUICg3JyBJTlNJREUgSEVJR0hUKQoKLTYnNiIgUkVBUiBET09SIE9QRU5JTkcgSEVJR0hUCgotNzUiIFJFQVIgRE9PUiBPUEVOSU5HIFdJRFRICgotTElQUEVSVCAzNTAwTEIgRVogTFVCRSBMRUFGIFNQUklORyBBWExFCgotUE9XREVSQ09BVCBHUkVZIE1PRFVMQVIgV0hFRUxTIFdJVEggSFVCIENPVkVSUwoKLVNUMjA1Lzc1L1IxNSBMT0FEIFJBTkdFIEMgUkFESUFMIFRSQUlMRVIgVElSRVMKCi1TQ09SUElPTiBMSU5FRCAyIlggMyIgVFVCRSBUT05HVUUKCgotU0NPUlBJT04gTElORUQgUkVBUiBIT09QCgotNiIgSUJFQU0gRlJBTUUKCi0xNiIgT04gQ0VOVEVSIFdBTEwgU1RVRFMKCi0yNCIgT04gQ0VOVEVSIEZMT09SIENST1NTTUVNQkVSUwoKLTI0IiBPTiBDRU5URVIgUk9PRiBCT1dTCgotMzYiIFNJREUgRE9PUiBXSVRIIEZMVVNITE9DSyBXSVRIIEJBUkxPQ0sgT04gUk9BRFNJREUKCi1ET1VCTEUgUkVBUiBET09SUwoKLVdISVRFIFZJTllMIENFSUxJTkcKCi0zLzgiIERSWU1BWCBXQUxMUwoKLTMvNCIgRFJZTUFYIEZMT09SCgotMTIgVk9MVCBET01FIExJR0hUIFdJVEggU1dJVENICgotUEFJUiBPRiBTSURFV0FMTCBWRU5UUwoKLUxFRCBDTEVBUkFOQ0UgTElHSFRTCgotTEVEIFRBSUxMSUdIVFMKCi0yIDUvMTYiIEJBTEwKCi0oNylXQVkgUExVRw==",
  },
  {
    id: 5,
    stock: "HGR-TA224280",
    dealer: "HGR's Truck and Trailer",
    category: "Trailers",
    subcategory: "Living Quarters Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 2568,
    bytes: 2568,
    sha256: "fce3307f192652eb",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "hgr_delimited",
    expectedHandling: "normalized",
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 63,
    rawDelimitedLines: 60,

    notes: "Dealer-offer exclusion ('WE CAN ADD...'). ALSO the heaviest grouping test in the set: 60 delimited bullets. Contains the same wrapped-continuation 'HANDLES' fragment as 223168.",

    b64: "VFJBSUxFUlMgRk9SIEVWRVJZVEhJTkcgQU5EIEVWRVJZVEhJTkcgRk9SIFRSQUlMRVJTCgoKLVdFIENBTiBBREQgR0VORVJBVE9SLFdJTkNILEFXTklORyhTKSxGUkVFWkVSCkNVUlRBSU5TLEVUQy4KCi1GVUxMIEJBVEhST09NIEFORCBTSE9XRVIgUEFDS0FHRQoKLTM5IEdBTExPTiBGUkVTSFdBVEVSIENBUEFDSVRZCgotKDIpMzAgR0FMTE9OIFdBU1RFIFRBTktTCgotMTUuMCBCVFUgQUlSIENPTkRJVElPTkVSIFdJVEggSEVBVCBTVFJJUAoKLURPTUVUSUMgMjVLIEJUVSBHQVMgRlVSTkFDRQoKLVJFQyBQUk8gNjBLIEJUVSBPTiBERU1BTkQgMTIgVk9MVC9MUCBIT1QgV0FURVIgSEVBVEVSCgotQlVJTFQgSU4gRE9NRVRJQyBSTSA4NTAxUkZCUCAzIFdBWSAzLjcgQ1VCSUMgRlQgR0FTL0VMRUNUUklDIFJFRlJJREdFUkFUT1IKCi0oMikgMzBMQiBQUk9QQU5FIEJPVFRMRVMKCi1DQVJCT04gTU9OT1hJREUgREVURUNUT1IKCi1BTS9GTSBTVEVSRU8gTVAzL0FNL0ZNL0JMVUVUT09USCBXSVRIICg0KSBJTlRFUklPUiBTUEVBS0VSUyBBTkQgKDIpIEVYVEVSSU9SIFNQRUFLRVJTCgotMTYwMDBMQiBEVUFMIEhZRFJBVUxJQyBMQU5ESU5HIEdFQVIKCi1MT0NLQUJMRSA0OCIgWCAzMiIgQUNDRVNTIERPT1IgVU5ERVIgR09PU0VORUNLIFJJU0VSCgotMzAnNCIgRlJPTSBSRUFSIERPT1IgVE8gVEhFIEVORCBPRiBUSEUgQ0FCSU5FVFMKCi0xMCcgRlJPTSBSRUFSIE9GIENBQklORVRTIFRPIFRIRSBCQVRIUk9PTQoKLTY4IiBGUk9NIFRIRSBXSURFU1QgUE9JTlQgT0YgQkFTRSBDQUJJTkVUIFRPIENVUkJTSURFIFdBTEwKCi1DSFJPTUUgRlJPTlQgQ0FQIFdJVEggQ09STkVSIENBU1RJTkdTCgotQ0hST01FIEZST05UIFZFUlRJQ0FMIENPUk5FUlMKCi1TQ1JFV0xFU1MgLjA0MCBXSElURSBFWFRFUklPUiBNRVRBTAoKLSgxKSBQSUVDRSBBTFVNSU5VTSBST09GCgotSEVBVlkgRFVUWSBUUlVDSyBCT0RZIFRPUCBXUkFQCgotMjQiIFNUT05FR1VBUkQKCi00IiBCT1RUT00gVFJJTSBXSVRIIFJFRCBBTkQgV0hJVEUgRE9UIFRBUEUKCi1DSFJPTUUgUkVBUiBDT1JORVJTCgotMTIgVk9MVCBMRUQgUkVBUiBMT0FESU5HIExJR0hUUwoKLVNQUkVBRCBBWExFIERFU0lHTgoKLURFWFRFUiBUUklQTEUgNzAwMExCIEVaIExVQkUgVE9SU0lPTiBBWExFUyBXSVRIIEJSQUtFUyBPTiBBTEwgV0hFRUxTCgotRUFHTEUgQUxVTUlOVU0gV0hFRUxTCgotU1RFUkxJTkcgU1QyMzUvODAvUjE2IExPQUQgUkFOR0UgRyBSQURJQUwgVFJBSUxFUiBUSVJFUwoKLTE2IiBPTiBDRU5URVIgV0FMTCBTVFVEUwoKLTE2IiBPTiBDRU5URVIgRkxPT1IgQ1JPU1NNRU1CRVJTCgotOCcgSU5TSURFIEhFSUdIVAoKLTk2IiBCRUFWRVJUQUlMCgotOTQiIFJBTVAgRE9PUiBPUEVOSU5HIFdJRFRICgotNyc4IiBSRUFSIFJBTVAgRE9PUiBPUEVOSU5HIEhFSUdIVAoKLTQ4IiBET1VCTEUgUlYgU0lERSBET09SIFdJVEggRkxVU0hMT0NLCgotQUxVTUlOVU0gU0xJREVPVVQgU1RFUAoKLVNQUklORyBBU1NJU1QgUkVBUiBSQU1QIFdJVEggRFVBTCBTUFJJTkdTIEFORCBGUkVFWkVSCkhBTkRMRVMKCi1VTklURUQgQlVJTFQgNDgiIEFMVU1JTlVNIFJBTVAgRkxBUCBXSVRIIEFMVU1JTlVNIFNVUFBPUlRTCgotNTBBTVAgRUxFQ1RSSUNBTCBQQUNLQUdFIFdJVEggQ09OVkVSVEVSL0NIQVJHRVIKCi0oNSkgMTEwIFZPTFQgSU5URVJJT1IgUkVDRVBUUwoKLSgyKTExMCBWT0xUIEVYVEVSSU9SIEdGSSBSRUNFUFRTCgotKDkpIEhVWCAxNCIgMTIgVk9MVCBMRUQgSU5URVJJT1IgTElHSFRTCgotKDMpIE5PVkEgMTQiQU5HTEVEIDEyIFZPTFQgTEVEIFNDRU5FIExJR0hUUyBPTiBDVVJCU0lERQoKLSgyKSBOT1ZBIDE0IkFOR0xFRCAxMiBWT0xUIExFRCBSRUFSIExPQURJTkcgTElHSFRTCgotQkFTRSBBTkQgT1ZFUkhFQUQgQUxVTUlOVU0gQ0FCSU5FVFMgT04gVEhFIFNJREVXQUxMIFdJVEggSEFMRiBDTE9TRVQgQU5EIFVTIEdFTkVSQUwgKDcpRFJBV0VSIFRPT0xCT1gKCi1JTlNVTEFURUQgR0VORVJBVE9SIENPTVBBUlRNRU5UIFdJVEggMzYiIFggMzAiIFRPUCBISU5HRSBHRU5FUkFUT1IgRE9PUiBBTkQgR0FTIFNIT0NLCgotU1RFUFMgVDAgVVBQRVIgREVDSwoKLUFMVU1JTlVNIE9WRVJIRUFEIEFORCAoMikgSEFMRiBDTE9TRVRTIElOIFJJU0VSL0JFRFJPT00gQVJFQQoKLSgyKUZSQU1FTEVTUyAzMCJYMjIiIFRJTlRFRCBFR1JFU1MgV0lORE9XUyBJTiBSSVNFUi9CRURST09NIEFSRUEKCi1TQ1JFV0xFU1MgV0hJVEUgQUxVTUlOVU0gQ0VJTElORwoKLUlOU1VMQVRFRCBDRUlMSU5HCgotMzYiIEdSRVkgTUFSSU5FIENBUlBFVCBLSUNLUExBVEUgV0lUSCBTQ1JFV0xFU1MgV0hJVEUgTUVUQUwgQUJPVkUgT04gVEhFIFdBTExTCgotUlVCQkVSIENPSU4gRkxPT1JJTkcgSU5DTFVESU5HIFJBTVAKCi1SRUNFU1NFRCBUSVJFIENPTVBBUlRNRU5UIElOIEZMT09SCgotKDIpUk9PRiBWRU5UCgotKDIpV0lSRSBBTkQgQlJBQ0UgRk9SIEZVVFVSRSBBSVIgQ09ORElUSU9OSU5HCgotTEVEIENMRUFSQU5DRSBMSUdIVFMKCi1FWFRSQSBMRUQgVEFJTExJR0hUUwoKLSg3KVdBWSBQTFVH",
  },
  {
    id: 6,
    stock: "HGR-S1254388",
    dealer: "HGR's Truck and Trailer",
    category: "Trailers",
    subcategory: "Utility Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 603,
    bytes: 612,
    sha256: "11e2a1f7837f21e8",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "hgr_delimited",
    expectedHandling: "normalized",
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 17,
    rawDelimitedLines: 16,

    notes: "MOJIBAKE tolerance. Double-encoded smart quotes in DECK / HIGH SIDES lines. chars 603 != bytes 612. Kept as-is + MOJIBAKE warning; never repaired (repair is T4.3).",

    b64: "VFJBSUxFUlMgRk9SIEVWRVJZVEhJTkcgQU5EIEVWRVJZVEhJTkcgRk9SIFRSQUlMRVJTCiAKLTEvNCIgU1RFRUwgQ09OU1RSVUNUSU9OCi0zNTAwTEIgRVogTFVCRSBMRUFGIFNQUklORyBBWExFUyBXSVRIIEJSQUtFUyBPTiBBTEwgV0hFRUxTCi1TVDIwNS83NS9SMTUgTE9BRCBSQU5HRSBDIFJBRElBTCBUUkFJTEVSIFRJUkVTCi1QT1dERVJDT0FUIFRSQUlMRVIgV0hFRUxTCi04MiIgQkVUV0VFTiBGRU5ERVJTCi0xNMODwqLDgj/Dgj8gREVDSwotMTTDg8Kiw4I/w4LCnSBISUdIIFNJREVTIFdJVEggUk9VTkQgVFVCVUxBUiBUT1AgUkFJTAotUkVJTkZPUkNFRCBSRUFSIEdBVEUgV0lUSCBFWFRSQSBVUFJJR0hUUyBBTkQgSEVBVlkgTUVTSAotU1BSSU5HIEFTU0lTVCBGT1IgUkVBUiBHQVRFUwotMiIgVFJFQVRFRCBQSU5FIERFQ0sKLSgzKVJPV1MgT0YgREVDSyBTQ1JFV1MKLTJLIERST1AgTEVHIEpBQ0sKLVNQQVJFIFRJUkUgTU9VTlQKLUxFRCBMSUdIVElORwotKDcpV0FZIFBMVUcgV0lUSCBJTlNVTEFURUQgV0lSSU5HIFJVTiBUSFJPVUdIIEdST01NRVRTIFdFTERFRCBUTyBUSEUgRlJBTUUoTk8gSE9MRVMgQlVSTkVEIElOIFRIRSBGUkFNRSkKLTIgNS8xNiBDT1VQTEVS",
  },
  {
    id: 7,
    stock: "HGR-T1261698",
    dealer: "HGR's Truck and Trailer",
    category: "Trailers",
    subcategory: "Car Hauler Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 740,
    bytes: 779,
    sha256: "88bfbbc916094309",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "hgr_delimited",
    expectedHandling: "normalized",
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 21,
    rawDelimitedLines: 17,

    notes: "RECONCILIATION / NO-FALSE-POSITIVE fixture (relabeled 2026-08-02 - NOT contradiction-positive). 3 bare-spec lines promote at low confidence. deck_length 16'+2' additive == bare 18'; width 82 == 82; axle 3500 == 3500 -> NO conflicts. Tire Load Range D vs C is a real data conflict but high-vs-high, which Stage 1a deliberately no-ops. Expect ZERO CONTRADICTION warnings.",

    b64: "VFJBSUxFUlMgRk9SIEVWRVJZVEhJTkcgQU5EIEVWRVJZVEhJTkcgRk9SIFRSQUlMRVJTCgrCtyAgICAgICAgIDE24oCZKzLigJkgRGVjayBMZW5ndGgKCsK3ICAgICAgICAgODLigJ0gQmV0d2VlbiB0aGUgRmVuZGVycwoKwrcgICAgICAgICA2MOKAnSBTbGlkZSBJbiBSYW1wcwoKwrcgICAgICAgICAzNTAwIyBFWiBMdWJlIExlYWYgU3ByaW5nIEF4bGVzIHdpdGggQnJha2VzIG9uIEFsbCBXaGVlbHMKCsK3ICAgICAgICAgQmxhY2sgUG93ZGVyY29hdCBUcmFpbGVyIHdoZWVscyB3aXRoIENocm9tZSBIdWIgQ292ZXJzCgrCtyAgICAgICAgIFNUMjA1Lzc1L1IxNSBMb2FkIFJhbmdlIEQgVHJhaWxlciBUaXJlcwoKwrcgICAgICAgICAyMDAwIyBUb3AgV2luZCBEcm9wIExlZyBKYWNrCgrCtyAgICAgICAgIEQuTy5ULiBMRUQgTGlnaHRpbmcKCsK3ICAgICAgICAgU2FmZXR5IENoYWlucwoKwrcgICAgICAgICBTdGFrZSBQb2NrZXRzCgpMZW5ndGggMTjigJkKCldpZHRoIDgy4oCdCgpBeGxlIDM1MDAKCsK3ICAgICAgICAgTmV3IFRpcmVzICgyMDUtMTUpIExvYWQgUmFuZ2UgQwoKwrcgICAgICAgICBTZWFsZWQgV2lyaW5nIEhhcm5lc3MKCsK3ICAgICAgICAgMiA1LzE24oCzIENvdXBsZXIKCsK3ICAgICAgICAgMuKAsyBUcmVhdGVkIFBpbmUgRmxvb3Igd2l0aCAoMykgUm93cyBvZiBTY3Jld3MKCsK3ICAgICAgICAgNeKAsyB4IDPigLMgeCAxLzTigLMgRnJhbWUKCsK3ICAgICAgICAgRnJvbnQgQnVtcCBSYWlsCgrCtyAgICAgICAgIFNwYXJlIE1vdW50IHdpdGggU3BhcmU=",
  },
  {
    id: 8,
    stock: "HGR-S1253331",
    dealer: "HGR's Truck and Trailer",
    category: "Trailers",
    subcategory: "Dump Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 617,
    bytes: 637,
    sha256: "d5e54a3cd1b96904",
    hasTab: true,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "hgr_delimited",
    expectedHandling: "normalized",
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 20,
    rawDelimitedLines: 19,

    notes: "TAB-SPLIT. Contains a literal TAB joining two bullets. splitLines must emit sub-line ids (e.g. L9a/L9b), so the splitLines count EXCEEDS rawNonEmptyLines by 1.",

    b64: "VFJBSUxFUlMgRk9SIEVWRVJZVEhJTkcgQU5EIEVWRVJZVEhJTkcgRk9SIFRSQUlMRVJTCgrCtyBHb29zZW5lY2sKwrcgMTAsMDAwIyBFWiBMdWJlIER1YWwgVGFuZGVtIEF4bGVzCsK3IFNUMjM1LzgwL1IxNiBMUkUgVHJhaWxlciBSYWRpYWxzCsK3IFNpbHZlciBNb2QgV2hlZWxzCsK3IEJyYWtlcyBvbiBCb3RoIEF4bGVzCsK3IERvdWJsZSBSZWFyIERvb3JzCsK3IEktQmVhbSBGcmFtZQrCtyBEdWFsIDEySyBFbGVjdHJpYy9IeWRyYXVsaWMgSmFja3MKwrcgU3BhcmUgVGlyZSBSYWNrIHdpdGggU3BhcmUJwrcgRWxlY3RyaWMgQnJha2UgQXdheSBTeXN0ZW0KwrcgU2VhbCBCZWFtIEQuTy5ULiBMaWdodGluZwrCtyBTZWFsZWQgV2lyaW5nIEhhcm5lc3MgNyBXYXkgUGx1ZwrCtyBUYXJwIEtpdCB3aXRoIFdpbmQgRGVmbGVjdG9yCsK3IDEwIEdhLiBTaWRlcyBhbmQgRmxvb3IKwrcgTG9ja2FibGUgQm94IGZvciBIeWRyYXVsaWMgUHVtcCBhbmQgQmF0dGVyeQrCtyBQdW1wIHdpdGggQmF0dGVyeSBhbmQgUmVtb3RlCsK3IFNjaXNzb3IgSG9pc3QgJiBFbGVjdHJpYyBPdmVyIEh5ZHJhdWxpYwrCtyBTb2xhciBDaGFyZ2VyCsK3IE9uIEJvYXJkIDExMCBWb2x0IEJhdHRlcnkgQ2hhcmdlcgrCtyA4JyBTbGlkZSBJbiBSYW1wcw==",
  },
  {
    id: 9,
    stock: "MPX-1KT3425",
    dealer: "Impex Heavy Metal",
    category: "Trailers",
    subcategory: "Gooseneck Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 610,
    bytes: 640,
    sha256: "0f4437d0fea0b271",
    hasTab: false,
    hasZwsp: true,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "impex_labeled_sections",
    expectedHandling: "safe_fallback",
    expectedWarningCode: "FORMAT_HANDLER_DEFERRED",

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 18,
    rawDelimitedLines: 0,

    notes: "DETECTOR-ORDERING fixture. Carries BOTH the Impex signature (Quick Highlights: + bullet-specs, Why Choose + check-marks) AND an Allied signature (Category Specific positional block). Most-specific-first ordering must resolve it to impex_labeled_sections, not allied_key_value. Contains U+200B ZERO-WIDTH SPACES around 'KAUFMAN 157032'.",

    b64: "MjAxOSBLYXVmbWFuIFR3byBDYXIvVHJ1Y2sgR29vc2VuZWNrIFRyYWlsZXIKUXVpY2sgSGlnaGxpZ2h0czoK4oCiIEdWV1I6IDE0LDAwMCBsYnMuIOKAkyBCdWlsdCB0byBoYW5kbGUgaGVhdnkgbG9hZHMgd2l0aCBlYXNlLgrigKIgRGVjazogMzUuNeKAmSBkZWNrLCBwZXJmZWN0IGZvciB0cmFuc3BvcnRpbmcgdHdvIHZlaGljbGVzIG9yIGVxdWlwbWVudC4K4oCiIEJyYWtlczogRWxlY3RyaWMgYnJha2VzIGZvciBlbmhhbmNlZCBjb250cm9sIGFuZCBzYWZldHkuCuKAoiBDb25kaXRpb246IEV4Y2VsbGVudCDigJMgV2VsbC1tYWludGFpbmVkIGFuZCByZWFkeSB0byB3b3JrLgpXaHkgQ2hvb3NlIFRoaXMgVHJhaWxlcj8K4pyU77iPIFNwYWNpb3VzIGRlY2sgZGVzaWduZWQgZm9yIGVmZmljaWVudCB0cmFuc3BvcnQgb2YgY2FycyBvciB0cnVja3MuCuKclO+4jyBEdXJhYmxlIGNvbnN0cnVjdGlvbiBlbnN1cmVzIGxvbmctbGFzdGluZyBwZXJmb3JtYW5jZS4K4pyU77iPIElkZWFsIGZvciBjYXIgaGF1bGluZywgZXF1aXBtZW50IHRyYW5zcG9ydCwgb3IgZmxlZXQgdXNlLgrigItLQVVGTUFOIDE1NzAzMuKAiwpDYXRlZ29yeSBTcGVjaWZpYwpDb21wb3NpdGlvbgpTdGVlbApDYXJzCjIKVHlwZSBvZiBOZWNrCkdvb3NlbmVjaw==",
  },
  {
    id: 10,
    stock: "ATT-024943",
    dealer: "Allied Truck & Trailer Sales",
    category: "Trailers",
    subcategory: "Dry Van Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 380,
    bytes: 384,
    sha256: "22e97e8a7252a479",
    hasTab: false,
    hasZwsp: true,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "allied_key_value",
    expectedHandling: "safe_fallback",
    expectedWarningCode: "FORMAT_HANDLER_DEFERRED",

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 12,
    rawDelimitedLines: 0,

    notes: "Allied positional key/value. Long prose intro + 'Weights & Dimensions' + 'Category Specific' label-line/value-line pairs. Zero delimiters. Contains U+200B ZERO-WIDTH SPACES around 'WABASH 40 LIFTGATE'.",

    b64: "MjAwNCBXYWJhc2ggNDBmdCBkcnkgdmFuIHRyYWlsZXIsIHNpbmdsZSBheGxlLCB0dWNrYXdheSBsaWZ0Z2F0ZSBpbiBwZXJmZWN0IHdvcmtpbmcgb3JkZXIsIGdvb2Qgcm9sbCB1cCBkb29yLCBza3lsaWdodHMsIGFsdW0gZmxvb3IgYW5kIHJvb2YsIHRpcmUgaW5mbGF0aW9uIHN5c3RlbSwgc3ByaW5nIHJpZGUsIGxvdyBjdWJlIDEyZnQgY2xlYXJhbmNlIDg4aW4gZG9vciBoZWlnaHQuIE11bHRpcGxlIHVuaXRzIGF2YWlsYWJsZSwgYXNrIGZvciBkZXRhaWxzLgrigItXQUJBU0ggNDAgTElGVEdBVEXigIsKV2VpZ2h0cyAmIERpbWVuc2lvbnMKTGVuZ3RoCjQwIGZ0CldpZHRoCjEwMiBpbgpIZWlnaHQKMTQ0IGluCkNhdGVnb3J5IFNwZWNpZmljCkxpZnQgRW5kIEdhdGUKWWVz",
  },
  {
    id: 11,
    stock: "ATT-328935",
    dealer: "Allied Truck & Trailer Sales",
    category: "Trailers",
    subcategory: "Flatbed Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 300,
    bytes: 300,
    sha256: "516a2b42b0d6c900",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "allied_key_value",
    expectedHandling: "safe_fallback",
    expectedWarningCode: "FORMAT_HANDLER_DEFERRED",

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 15,
    rawDelimitedLines: 0,

    notes: "Second Allied body, different subcategory and half the size. Admitted on observed shape, not dealer identity. Pure ASCII (chars == bytes). Proves allied_key_value detection is format-based, not unit-specific.",

    b64: "MTk5NiBGcnVlaGF1ZiA0NXg5NiBmbGF0YmVkIHRyYWlsZXIgd2l0aCBNb2ZmZXR0IGtpdCAuIEZsb29yIGlzIGRlY2VudCwgdGlyZXMgYXJlIGdvb2QsIG5lZWRzIDQgd2hlZWwgYnJha2Ugam9iLiBWZXJ5IHNvbGlkIHRyYWlsZXIuIExpdHRsZSB0byBubyBydXN0IHN0cnVjdHVyYWxseS4KV2VpZ2h0cyAmIERpbWVuc2lvbnMKTGVuZ3RoCjQ1IGZ0CldpZHRoCjk2IGluCkNhdGVnb3J5IFNwZWNpZmljCkNvbXBvc2l0aW9uClN0ZWVsClR5cGUgb2YgTmVjawpGaXhlZApGb3JrbGlmdCBQYWNrYWdlClllcwpUaWUgRG93bnMKWWVz",
  },
  {
    id: 12,
    stock: "MAP-296533",
    dealer: "Mid-Atlantic Power & Equipment",
    category: "Trailers",
    subcategory: "Pole Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 179,
    bytes: 179,
    sha256: "1297253f13f9e563",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "free_form",
    expectedHandling: "safe_fallback",
    expectedWarningCode: "FORMAT_FREE_FORM",

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 1,
    rawDelimitedLines: 0,

    notes: "REAL FREE-FORM WITNESS — replaces the synthetic fixture previously occupying id 12, after MAP-296533 proved a real prose-only trailer exists in live inventory. Preserves the same contract role: free_form -> safe_fallback. ★ WHY THIS BODY IS UNUSUALLY GOOD EVIDENCE: it opens with a MATERIAL BUYER DISCLOSURE — 'TRAILER LOOKS AND PULLS FINE BUT DOES HAVE A SALVAGE TITLE.' — followed by real facts (extendable chassis, tire size, all-steel wheels, single fixed rear axle, steel composition). Safe fallback protects that disclosure BY REFUSING TO REINTERPRET IT: the normalizer produces no dispositions and preserves the source body unchanged for the existing description path. A false normalization here would be far more dangerous than doing nothing, which is the argument for safe_fallback in one real unit. Pure ASCII, 179/179, one physical line, zero delimiters, none of the Impex or Allied signature blocks.",

    b64: "VFJBSUxFUiBMT09LUyBBTkQgUFVMTFMgRklORSBCVVQgRE9FUyBIQVZFIEEgU0FMVkFHRSBUSVRMRS4gQlVUTEVSIFBPTEUgVFJBSUxFUi4gRXh0ZW5kYWJsZSBjaGFzc2lzLiBUaXJlcyAxMi0xNi41IExULiBBbGwgc3RlZWwgd2hlZWxzLiBTaW5nbGUgZml4ZWQgcmVhciBheGxlLiBTdGVlbCBjb21wb3NpdGlvbi4=",
  },
  {
    id: 13,
    stock: "DSE-6556",
    dealer: "Dick Smith Equipment",
    category: "Trucks",
    subcategory: "Dump Truck",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 752,
    bytes: 754,
    sha256: "c8ebd449d9e6f5fb",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: true,   // category gate short-circuit; normalizeTrailerSpecs returns null
    expectedFormat: null,
    expectedHandling: null,
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 21,
    rawDelimitedLines: 15,

    notes: "GATE fixture. category='Trucks' -> normalizeTrailerSpecs returns null. Body is DELIBERATELY delimiter-shaped (15 dash bullets), which proves the category gate executes BEFORE format detection - a prose-only non-trailer could not prove that. NOTE: this raw_description is canonical DX output, not a dealer feed (separate provenance finding); irrelevant here since fixture bytes are frozen.",

    b64: "MjAxNSBGb3JkIEYtNzUwIOKAkyBNZWRpdW0tRHV0eSBEaWVzZWwgRHVtcCBUcnVjawoKS2V5IERldGFpbHMKLSBZZWFyOiAyMDE1Ci0gTWFrZTogRm9yZAotIE1vZGVsOiBGLTc1MAotIE1pbGVhZ2U6IDE2OCwxODQKLSBFbmdpbmU6IDYuN2wgNi1DeWwKLSBUcmFuc21pc3Npb246IEF1dG9tYXRpYwotIERyaXZldHJhaW46IDR4MgotIEZ1ZWw6IERpZXNlbAotIEdWV1I6IENsYXNzIDY6IDE5LDUwMSAtIDI2LDAwMCBsYiAoOCw4NDUgLSAxMSw3OTQga2cpCi0gQm9keSBDbGFzczogVHJ1Y2sKLSBIb3JzZXBvd2VyOiAyNDAgSFAKLSBUb3JxdWU6IDU2MCBsYi1mdAotIFByaWNlOiAkMjUsOTAwCi0gVklOOiAzRlJXRjdGQ1hGVjUyNTE2NwotIFN0b2NrICM6IERTRS02NTU2CgpPdmVydmlldwpUaGlzIDIwMTUgRm9yZCBGLTc1MCBpcyBwb3dlcmVkIGJ5IGEgNi43TCBkaWVzZWwgZW5naW5lIHdpdGggYXV0b21hdGljIHRyYW5zbWlzc2lvbiBpbiBhIDR4MiBjb25maWd1cmF0aW9uLCBzaG93aW5nIDE2OCwxODQgbWlsZXMuIEJ1aWx0IGZvciBjb250cmFjdG9yIGpvYnNpdGUgd29yaywgbWF0ZXJpYWwgaGF1bGluZywgYW5kIGVxdWlwbWVudCBkZWxpdmVyeS4gUmVhZHkgZm9yIHJlbGlhYmxlIHBlcmZvcm1hbmNlIGFjcm9zcyBhIHZhcmlldHkgb2YgaGF1bGluZyBhcHBsaWNhdGlvbnMuCgpJbnRlcmVzdGVkIEluIFRoaXMgVW5pdD8KQ2FsbCBEaWNrIFNtaXRoIEVxdWlwbWVudDogOTE5LTczNC0xMTkxIHwgR29sZHNib3JvLCBOQw==",
  },
  {
    id: 14,
    stock: "HGR-V1438778",
    dealer: "HGR's Truck and Trailer",
    category: "Trailers",
    subcategory: "Equipment Trailer",

    // --- integrity (asserted by the fixture-integrity block, before any behavior test) ---
    chars: 763,
    bytes: 831,
    sha256: "3f7d666dc96bb1b8",
    hasTab: false,
    hasZwsp: false,

    // --- contract-derived expectations (safe to assert now) ---
    expectsNull: false,
    expectedFormat: "hgr_delimited",
    expectedHandling: "normalized",
    expectedWarningCode: null,

    // --- observed from bytes alone; anchors, NOT expectations ---
    rawNonEmptyLines: 24,
    rawDelimitedLines: 24,

    notes: "U+2022 DELIMITER WITNESS — the reason this fixture exists. 22 of its 24 lines begin with U+2022 BULLET; the other 2 begin with a hyphen. Before Stage 1a-V(a) (c72ebe8) those 22 lines failed the delimited test and were graded confidence:'low' instead of 'high' — the harm was SYSTEMATIC MISGRADING, not loss, and low confidence is what loses a contradiction. All 24 lines are delimited, so expect zero leadProse, zero excluded, zero warnings. NOTE L0 'PRIMED AND POWDERCOATED FRAME' is delimited but NOT spec-shaped; it groups by the 'frame' keyword. ★ FIVE OBSERVED MISGROUPINGS ARE FROZEN AS-IS AND ARE KNOWN DEFECTS, NOT EXPECTATIONS — see the per-line provenance in the goldens file.",

    b64: "LVBSSU1FRCBBTkQgUE9XREVSQ09BVEVEIEZSQU1FCgotMTbigJlUaWx0IEJlZCw04oCZIFN0YXRpb25hcnkgRGVjayAgCgrigKIgMTQsMDAwIGxiLiBHLlYuVy5SLgrigKIgNywwMDAgbGIuIHggMiBHLkEuVy5SLgrigKIgQWRqdXN0YWJsZSAyIDUvMTbigJ0gQmFsbCBCdWxsZG9nIENvdXBsZXIK4oCiIFNhZmV0eSBDaGFpbnMK4oCiIDEgLSBEcm9wIExlZyBKYWNrICgxMCwwMDAgbGIuKQrigKIgMiAtIERleHRlciBFLSBaIGx1YmUgQnJha2UgQXhsZXMgKDcsMDAwIGxiLikK4oCiIFRvcnNpb24gU3VzcGVuc2lvbgrigKIgNCAtIDE24oCdIEJsYWNrIE1vZHVsYXIgVHJhaWxlciAgV2hlZWxzCuKAoiA0IC1TVDIzNS84MFIxNiBMb2FkIFJhbmdlIEUgUmFkaWFsIFRyYWlsZXIgVGlyZXMgKDMsNTIwIGxiKQrigKIgU3Rha2UgUG9ja2V0cyAmIFJ1YnJhaWwK4oCiIEVsZWN0cmljIEJyZWFrYXdheSBLaXQgdy8gQ2hhcmdlcgrigKIgRGlhbW9uZCBQbGF0ZSBCb2x0IE9uIEZlbmRlcnMK4oCiIFRvb2wgVHJheSBJbiBUb25ndWUK4oCiIDExIERlZ3JlZSBUaWx0IFBpdGNoCuKAoiAz4oCdIHggMTbigJ0gQ3lsaW5kZXIK4oCiIDbigJ0gQ2hhbm5lbCBGcmFtZSAmIFRvbmd1ZQrigKIgM+KAnSBDaGFubmVsIENyb3NzbWVtYmVycyAxNuKAnSBvbiBDZW50ZXIK4oCiIDLigJ0gVHJlYXRlZCBQaW5lIEx1bWJlciBEZWNrCuKAoiA3NOKAnSBXaWRlIFRpbHRhYmxlIERlY2sK4oCiIDgy4oCdIEJldHdlZW4gRmVuZGVycwrigKIgRE9UIEFwcHJvdmVkIEZsdXNobW91bnQgTGlmZXRpbWUgTEVEIExpZ2h0cwrigKIgMTAgeWVhciBEZXh0ZXIgVG9yZmxleCBBeGxlIFdhcnJhbnR5",
  },
];

/** Decode a fixture body to its exact source string. */
function raw(fixture) {
  return Buffer.from(fixture.b64, 'base64').toString('utf8');
}

/** Look a fixture up by stock number. Throws rather than returning undefined. */
function byStock(stock) {
  const f = FIXTURES.find((x) => x.stock === stock);
  if (!f) throw new Error('No fixture for stock ' + stock);
  return f;
}

module.exports = { FIXTURES, raw, byStock };
