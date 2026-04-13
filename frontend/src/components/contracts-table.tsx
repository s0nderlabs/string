import { truncateAddress } from "@/lib/utils";

const CONTRACTS = [
  { name: "ZkRelay", address: "0xaB194c8030A81FaE84B197CAb238Ed18A5108050" },
  { name: "StringEscrow", address: "0x66B51d3150d461424174F55Fda61363a2e6cc916" },
  { name: "StringRegistry", address: "0x2d8E586847565AA4C517f177d922A37286e9d1F8" },
  { name: "Usdc.e", address: "0x18ec8e93627c893ae61ae0491c1c98769fd4dfa2" },
];

export function ContractsTable() {
  return (
    <div className="flex items-center justify-between">
      {/* Contracts inline */}
      <div className="flex items-center gap-6">
        {CONTRACTS.map((c) => (
          <div key={c.address} className="flex items-center gap-2 text-[10px]">
            <span className="font-[family-name:var(--font-pixel)] text-muted">{c.name}</span>
            <span className="font-[family-name:var(--font-mono)] text-dim">{truncateAddress(c.address)}</span>
          </div>
        ))}
        <span className="font-[family-name:var(--font-pixel)] text-[9px] bg-fg text-bg px-1.5 py-0.5 rounded">
          Hsk 133
        </span>
      </div>

      {/* Footer links */}
      <div className="flex items-center gap-4 text-[10px] font-[family-name:var(--font-pixel)] text-muted">
        <span>String v0.2.1</span>
        <a
          href="https://github.com/s0nderlabs/string"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-fg transition-colors"
        >
          GitHub
        </a>
        <a
          href="https://github.com/s0nderlabs"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-fg transition-colors"
        >
          s0nderlabs
        </a>
      </div>
    </div>
  );
}
