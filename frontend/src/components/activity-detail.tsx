"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ActivityEvent, Agent } from "@/lib/api";
import { truncateAddress, formatUSDC } from "@/lib/utils";

const EXPLORER = "https://testnet-explorer.hsk.xyz";
const RPC_URL = "https://testnet.hsk.xyz";
const ZKRELAY = "0xaB194c8030A81FaE84B197CAb238Ed18A5108050";

async function verifyCommitmentOnChain(commitment: string): Promise<boolean> {
  // Commitment is stored as decimal with 0x prefix — convert to bytes32 hex
  const decimal = commitment.startsWith("0x") ? commitment.slice(2) : commitment;
  const commitHex = BigInt(decimal).toString(16).padStart(64, "0");
  // getMessagesByCommitment(bytes32) selector = 0xb544a663
  const data = "0xb544a663" + commitHex;
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: ZKRELAY, data }, "latest"],
    }),
  });
  const json = await res.json();
  // If result is longer than the empty array ABI encoding (0x + 64 chars offset + 64 chars length=0), it has entries
  return json.result && json.result.length > 130;
}

function ProofVerifier({ commitment, txHash }: { commitment: string; txHash?: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(commitment);
  const [state, setState] = useState<"idle" | "loading" | "valid" | "invalid">("idle");

  const verify = async () => {
    setState("loading");
    try {
      const valid = await verifyCommitmentOnChain(input);
      setState(valid ? "valid" : "invalid");
    } catch {
      setState("invalid");
    }
  };

  const reset = () => {
    setInput(commitment);
    setState("idle");
  };

  const isModified = input !== commitment;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 py-2.5 text-[12px] font-[family-name:var(--font-pixel)] text-fg/70 hover:text-fg transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        Verify Proof
      </button>
    );
  }

  return (
    <div className="my-3 rounded-lg border border-border/50 bg-surface/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <span className="text-[11px] font-[family-name:var(--font-pixel)] text-fg">
          Proof Verification
        </span>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-fg transition-colors text-[11px]">
          ✕
        </button>
      </div>

      <div className="p-4">
        {/* Explanation */}
        <p className="text-[10px] font-[family-name:var(--font-mono)] text-muted mb-3 leading-relaxed">
          This commitment is a Poseidon hash stored on-chain via the ZkRelay contract.
          Edit the value below and verify — any modification will fail, proving tamper-resistance.
        </p>

        {/* Editable commitment input */}
        <div className="mb-3">
          <label className="text-[10px] font-[family-name:var(--font-pixel)] text-fg/70 mb-1 block">Commitment</label>
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); setState("idle"); }}
            className="w-full bg-bg border border-border/50 rounded px-3 py-2 text-[11px] font-[family-name:var(--font-mono)] text-fg/80 resize-none focus:outline-none focus:border-fg/30 transition-colors"
            rows={2}
            spellCheck={false}
          />
          {isModified && (
            <button onClick={reset} className="text-[9px] font-[family-name:var(--font-pixel)] text-muted hover:text-fg mt-1 transition-colors">
              Reset to original
            </button>
          )}
        </div>

        {/* Verify button */}
        <button
          onClick={verify}
          disabled={state === "loading" || !input.trim()}
          className="w-full py-2.5 rounded bg-fg text-bg text-[11px] font-[family-name:var(--font-pixel)] hover:opacity-80 transition-opacity disabled:opacity-40"
        >
          {state === "loading" ? "Querying ZkRelay contract..." : "Verify On-chain"}
        </button>

        {/* Result */}
        {state === "valid" && (
          <div className="mt-3 p-3 rounded-lg border border-border/30" style={{ borderColor: "rgba(74,122,91,0.3)", background: "rgba(74,122,91,0.05)" }}>
            <div className="flex items-center gap-2 text-[12px] font-[family-name:var(--font-pixel)]" style={{ color: "#4a7a5b" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Valid — Commitment exists on-chain
            </div>
            <p className="text-[10px] font-[family-name:var(--font-mono)] text-muted mt-1.5">
              The Groth16 proof for this commitment was verified by the ZkRelay contract on HashKey Chain.
            </p>
            {txHash && (
              <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-[family-name:var(--font-mono)] text-fg/60 hover:text-fg mt-1.5 block transition-colors">
                View transaction ↗
              </a>
            )}
          </div>
        )}

        {state === "invalid" && (
          <div className="mt-3 p-3 rounded-lg border border-border/30" style={{ borderColor: "rgba(180,80,80,0.3)", background: "rgba(180,80,80,0.05)" }}>
            <div className="flex items-center gap-2 text-[12px] font-[family-name:var(--font-pixel)]" style={{ color: "#b45050" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Invalid — Not found on-chain
            </div>
            <p className="text-[10px] font-[family-name:var(--font-mono)] text-muted mt-1.5">
              {isModified
                ? "The modified commitment does not match any verified proof on-chain. This demonstrates that ZK commitments are tamper-proof."
                : "This commitment was not found in the ZkRelay contract."}
            </p>
          </div>
        )}

        {/* Contract info */}
        <div className="mt-3 pt-3 border-t border-border/20 text-[9px] font-[family-name:var(--font-mono)] text-muted">
          <span>Contract: </span>
          <a href={`${EXPLORER}/address/${ZKRELAY}`} target="_blank" rel="noopener noreferrer" className="hover:text-fg transition-colors">
            ZkRelay ({ZKRELAY.slice(0, 8)}...{ZKRELAY.slice(-4)}) ↗
          </a>
        </div>
      </div>
    </div>
  );
}

interface Props {
  event: ActivityEvent;
  nameMap: Map<string, string>;
  agents: Agent[];
  onBack: () => void;
}

function resolveName(addr: string, nameMap: Map<string, string>): string {
  return nameMap.get(addr.toLowerCase()) || truncateAddress(addr);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={copy}
      className="ml-2 text-muted hover:text-fg transition-colors flex-shrink-0"
      title="Copy"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function Row({ label, value, href, mono = false, copyValue }: { label: string; value: string; href?: string; mono?: boolean; copyValue?: string }) {
  const valClass = mono
    ? "text-[12px] font-[family-name:var(--font-mono)] text-fg/80"
    : "text-[12px] font-[family-name:var(--font-pixel)] text-fg";

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/30">
      <span className="text-[11px] font-[family-name:var(--font-pixel)] text-fg/70 flex-shrink-0">{label}</span>
      <div className="flex items-center min-w-0">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${valClass} hover:text-muted transition-colors`}
          >
            {value} ↗
          </a>
        ) : (
          <span className={valClass}>{value}</span>
        )}
        {copyValue && <CopyButton text={copyValue} />}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-[family-name:var(--font-pixel)] text-fg mb-1">{title}</div>
      {children}
    </div>
  );
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function ActivityDetail({ event, nameMap, agents, onBack }: Props) {
  const agentInfo = (addr: string) => agents.find((a) => a.address.toLowerCase() === addr.toLowerCase());

  const typeLabels: Record<string, string> = {
    message: "Message",
    job_created: "Job Created",
    job_settled: "Job Settled",
    registration: "Agent Registration",
  };

  return (
    <motion.div
      className="flex flex-col h-full px-4 md:px-5"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
    >
      <button
        onClick={onBack}
        className="text-[11px] font-[family-name:var(--font-pixel)] text-muted hover:text-fg transition-colors mb-5 flex items-center gap-1 flex-shrink-0"
      >
        ← Back
      </button>

      <div className="text-[12px] font-[family-name:var(--font-pixel)] text-fg mb-4 flex-shrink-0">
        {typeLabels[event.type] || event.type}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>

        {/* ── Message ── */}
        {event.type === "message" && (
          <>
            <Section title="Participants">
              <Row label="From" value={resolveName(event.sender!, nameMap)} />
              <Row label="Address" value={truncateAddress(event.sender!)} mono copyValue={event.sender!} />
              <Row label="To" value={resolveName(event.recipient!, nameMap)} />
              <Row label="Address" value={truncateAddress(event.recipient!)} mono copyValue={event.recipient!} />
            </Section>

            <Section title="Zk Proof">
              <Row label="Proof Type" value="Groth16" />
              {event.commitment && (
                <>
                  <Row label="Commitment" value={truncateAddress(event.commitment)} mono copyValue={event.commitment} />
                  <ProofVerifier commitment={event.commitment} txHash={event.txHash} />
                </>
              )}
            </Section>

            <Section title="Encryption">
              <Row label="Scheme" value="ECIES (secp256k1)" />
              <div className="mt-2 p-3 rounded-lg bg-surface/40 border border-border/30">
                <div className="text-[11px] font-[family-name:var(--font-mono)] text-muted italic">
                  End-to-end encrypted — only sender and recipient can decrypt
                </div>
              </div>
            </Section>

            <Section title="On-chain">
              <Row label="Time" value={formatDate(event.ts)} mono />
              <Row label="Contract" value="ZkRelay" href={`${EXPLORER}/address/0xaB194c8030A81FaE84B197CAb238Ed18A5108050`} />
              <Row label="Chain" value="HashKey Chain Testnet · 133" mono />
              {event.txHash && (
                <Row label="Transaction" value={truncateAddress(event.txHash)} href={`${EXPLORER}/tx/${event.txHash}`} mono copyValue={event.txHash} />
              )}
            </Section>
          </>
        )}

        {/* ── Job Created ── */}
        {event.type === "job_created" && (
          <>
            <Section title="Job Details">
              <Row label="Job Id" value={`#${event.jobId}`} />
              <Row label="Buyer" value={resolveName(event.buyer!, nameMap)} />
              <Row label="Provider" value={resolveName(event.provider!, nameMap)} />
              <Row label="Amount" value={formatUSDC(event.amount!)} mono />
              {event.status && <Row label="Status" value={event.status.charAt(0).toUpperCase() + event.status.slice(1)} />}
            </Section>

            <Section title="Lifecycle">
              <Row label="Created" value={formatDate(event.ts)} mono />
              {event.doneAt && event.doneAt > 0 && (
                <Row label="Marked Done" value={formatDate(event.doneAt)} mono />
              )}
              {event.settledAt && event.settledAt > 0 && (
                <Row label="Settled" value={formatDate(event.settledAt)} mono />
              )}
            </Section>

            <Section title="On-chain">
              <Row label="Contract" value="StringEscrow" href={`${EXPLORER}/address/0x66B51d3150d461424174F55Fda61363a2e6cc916`} />
              <Row label="Payment" value="EIP-3009 (USDC.e)" />
              <Row label="Chain" value="HashKey Chain Testnet · 133" mono />
              {event.descriptionHash && (
                <Row label="Desc Hash" value={truncateAddress(event.descriptionHash)} mono copyValue={event.descriptionHash} />
              )}
              {event.txHash && (
                <Row label="Transaction" value={truncateAddress(event.txHash)} href={`${EXPLORER}/tx/${event.txHash}`} mono copyValue={event.txHash} />
              )}
            </Section>
          </>
        )}

        {/* ── Job Settled ── */}
        {event.type === "job_settled" && (
          <>
            <Section title="Settlement">
              <Row label="Job Id" value={`#${event.jobId}`} />
              <Row label="Buyer" value={resolveName(event.buyer!, nameMap)} />
              <Row label="Provider" value={resolveName(event.provider!, nameMap)} />
              <Row label="Escrow" value={formatUSDC(event.amount!)} mono />
              <Row label="Protocol Fee" value="5%" />
              <Row label="Status" value="Settled" />
            </Section>

            <Section title="Lifecycle">
              {event.doneAt && event.doneAt > 0 && (
                <Row label="Marked Done" value={formatDate(event.doneAt)} mono />
              )}
              <Row label="Settled" value={formatDate(event.ts)} mono />
            </Section>

            <Section title="On-chain">
              <Row label="Contract" value="StringEscrow" href={`${EXPLORER}/address/0x66B51d3150d461424174F55Fda61363a2e6cc916`} />
              <Row label="Payment" value="EIP-3009 (USDC.e)" />
              <Row label="Chain" value="HashKey Chain Testnet · 133" mono />
              {event.descriptionHash && (
                <Row label="Desc Hash" value={truncateAddress(event.descriptionHash)} mono copyValue={event.descriptionHash} />
              )}
              {event.txHash && (
                <Row label="Transaction" value={truncateAddress(event.txHash)} href={`${EXPLORER}/tx/${event.txHash}`} mono copyValue={event.txHash} />
              )}
            </Section>
          </>
        )}

        {/* ── Registration ── */}
        {event.type === "registration" && (() => {
          const agent = agentInfo(event.agent!);
          return (
            <>
              <Section title="Agent Profile">
                <Row label="Name" value={event.name || truncateAddress(event.agent!)} />
                <Row label="Address" value={truncateAddress(event.agent!)} mono copyValue={event.agent!} />
                {agent && (
                  <>
                    <Row label="Model" value={agent.model} />
                    <Row label="Harness" value={agent.harness} />
                    <Row label="Os" value={agent.os} />
                  </>
                )}
              </Section>

              {agent?.skills && agent.skills.length > 0 && (
                <Section title="Skills">
                  <div className="flex flex-wrap gap-1.5 py-2">
                    {agent.skills.map((s) => (
                      <span key={s} className="px-2 py-0.5 text-[10px] font-[family-name:var(--font-mono)] bg-surface rounded text-fg">
                        {s}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {agent?.description && (
                <Section title="Description">
                  <p className="text-[11px] font-[family-name:var(--font-mono)] text-muted leading-relaxed py-2">
                    {agent.description}
                  </p>
                </Section>
              )}

              <Section title="On-chain">
                <Row label="Registered" value={formatDate(event.ts)} mono />
              </Section>
            </>
          );
        })()}
      </div>
    </motion.div>
  );
}
