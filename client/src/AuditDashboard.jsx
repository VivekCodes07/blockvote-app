import { useState, useEffect } from "react";
import {
  Blocks,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Hash,
  Link as LinkIcon,
  Copy,
  Check,
  LogIn,
  Vote,
  Calendar,
  Users,
  Clock3,
} from "lucide-react";

const formatDateTime = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
};

export default function AuditDashboard({ currentUser, onGoToLogin, onBack }) {
  const isAdmin = currentUser?.voter?.role === "admin";
  const [summary, setSummary] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [loading, setLoading] = useState(() => Boolean(currentUser?.token));
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  // Filter state
  const [filterType, setFilterType] = useState("ALL");

  // Copy-to-clipboard state
  const [copiedHash, setCopiedHash] = useState(null);

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleRefresh = async () => {
    if (!currentUser?.token) return;
    setRefreshing(true);
    try {
      if (isAdmin) {
        const [chainRes, summaryRes] = await Promise.all([
          fetch("/api/audit/chain?limit=100", {
            headers: { Authorization: `Bearer ${currentUser.token}` },
          }),
          fetch("/api/audit/summary", {
            headers: { Authorization: `Bearer ${currentUser.token}` },
          }),
        ]);

        if (chainRes.ok) {
          const chainData = await chainRes.json();
          setBlocks(chainData.blocks || []);
          setTotalBlocks(chainData.totalBlocks || 0);
        }
        if (summaryRes.ok) {
          const sumData = await summaryRes.json();
          setSummary(sumData);
        }
      } else {
        const summaryRes = await fetch("/api/audit/summary", {
          headers: { Authorization: `Bearer ${currentUser.token}` },
        });
        if (summaryRes.ok) {
          const sumData = await summaryRes.json();
          setSummary(sumData);
          setTotalBlocks(sumData.totalBlocks || 0);
        }
      }
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to refresh audit data.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleVerifyChain = async () => {
    if (!currentUser?.token || !isAdmin) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/audit/verify", {
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Verification request failed.");
      }
      setVerificationResult(data.verification);
    } catch (err) {
      setVerificationResult({
        isValid: false,
        reason: err.message || "Cryptographic verification could not be completed.",
      });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (!currentUser?.token) {
      return;
    }

    const headers = { Authorization: `Bearer ${currentUser.token}` };

    if (isAdmin) {
      Promise.all([
        fetch("/api/audit/chain?limit=100", { headers }).then((res) =>
          res.json().then((json) => ({ ok: res.ok, json }))
        ),
        fetch("/api/audit/summary", { headers }).then((res) =>
          res.json().then((json) => ({ ok: res.ok, json }))
        ),
      ])
        .then(([chainRes, summaryRes]) => {
          if (!isMounted) return;
          if (chainRes.ok) {
            setBlocks(chainRes.json.blocks || []);
            setTotalBlocks(chainRes.json.totalBlocks || 0);
          } else {
            setError(chainRes.json.message || "Failed to load audit chain.");
          }

          if (summaryRes.ok) {
            setSummary(summaryRes.json);
          }
          setLoading(false);
        })
        .catch((err) => {
          if (!isMounted) return;
          setError(err.message || "Failed to load blockchain ledger.");
          setLoading(false);
        });
    } else {
      fetch("/api/audit/summary", { headers })
        .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
        .then(({ ok, json }) => {
          if (!isMounted) return;
          if (ok) {
            setSummary(json);
            setTotalBlocks(json.totalBlocks || 0);
          } else {
            setError(json.message || "Failed to load audit summary.");
          }
          setLoading(false);
        })
        .catch((err) => {
          if (!isMounted) return;
          setError(err.message || "Failed to load audit summary.");
          setLoading(false);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [currentUser?.token, isAdmin]);

  if (!currentUser) {
    return (
      <div className="election-detail-container">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={15} /> Back to Dashboard
        </button>
        <div className="voter-status-banner inactive" style={{ marginTop: "20px" }}>
          <LogIn size={22} />
          <div>
            <strong>Authentication Required</strong>
            <p>Please sign in to inspect the cryptographic blockchain audit ledger.</p>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={onGoToLogin}
            style={{ marginLeft: "auto" }}
          >
            <LogIn size={14} /> Sign In
          </button>
        </div>
      </div>
    );
  }

  // Filter blocks by event type
  const filteredBlocks = blocks.filter((b) => {
    if (filterType === "ALL") return true;
    if (filterType === "VOTES") return b.eventType === "VOTE_RECORDED";
    if (filterType === "ELECTIONS")
      return b.eventType.startsWith("ELECTION_");
    if (filterType === "CANDIDATES")
      return b.eventType.startsWith("CANDIDATE_");
    if (filterType === "GENESIS") return b.eventType === "GENESIS";
    return true;
  });

  const getEventBadgeClass = (type) => {
    switch (type) {
      case "GENESIS":
        return "event-badge genesis";
      case "VOTE_RECORDED":
        return "event-badge vote";
      case "ELECTION_CREATED":
      case "ELECTION_PUBLISHED":
        return "event-badge election";
      case "CANDIDATE_ADDED":
      case "CANDIDATE_REMOVED":
        return "event-badge candidate";
      default:
        return "event-badge default";
    }
  };

  const getEventIcon = (type) => {
    switch (type) {
      case "GENESIS":
        return <Blocks size={14} />;
      case "VOTE_RECORDED":
        return <Vote size={14} />;
      case "ELECTION_CREATED":
      case "ELECTION_PUBLISHED":
        return <Calendar size={14} />;
      case "CANDIDATE_ADDED":
      case "CANDIDATE_REMOVED":
        return <Users size={14} />;
      default:
        return <Hash size={14} />;
    }
  };

  return (
    <div className="audit-dashboard-container results-page-fadein">
      {/* Top Action Bar */}
      <div className="results-top-actions">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={15} /> Back to Dashboard
        </button>

        <div style={{ display: "flex", gap: "10px" }}>
          {isAdmin && (
            <button
              type="button"
              className="primary-button verify-btn"
              onClick={handleVerifyChain}
              disabled={verifying}
              title="Perform cryptographic verification of all SHA-256 block hashes and links"
            >
              <ShieldCheck size={15} className={verifying ? "spinner" : ""} />
              {verifying ? "Verifying SHA-256 Chain..." : "Verify Blockchain"}
            </button>
          )}

          <button
            type="button"
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh blockchain ledger"
          >
            <RefreshCw size={14} className={refreshing ? "spinner" : ""} />
            {refreshing ? "Updating..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Hero Header */}
      <div className="results-hero">
        <div className="hero-top-row">
          <div className="hero-title-group">
            <div className="results-badges-row">
              <span className="certified-badge" style={{ background: "rgba(99, 102, 241, 0.16)", color: "#a5b4fc", borderColor: "rgba(99, 102, 241, 0.35)" }}>
                <Blocks size={13} /> SHA-256 Cryptographic Audit Ledger
              </span>
              <span className="certified-badge">
                <ShieldCheck size={13} /> Tamper-Evident Hash Chain
              </span>
            </div>
            <h2>Blockchain Explorer &amp; Audit Trail</h2>
            <p className="hero-description">
              Cryptographically linked ledger recording all critical election lifecycle events and anonymous votes.
              Each block contains a cryptographic hash of its payload and points to the previous block&apos;s hash.
            </p>
          </div>
        </div>

        <div className="hero-info-grid">
          <div className="hero-info-box">
            <span className="hero-info-label">Total Blocks Mined</span>
            <span className="hero-info-value">{totalBlocks.toLocaleString()} Blocks</span>
          </div>
          <div className="hero-info-box">
            <span className="hero-info-label">Genesis Reference</span>
            <span className="hero-info-value font-mono">0000...0000</span>
          </div>
          <div className="hero-info-box">
            <span className="hero-info-label">Hashing Algorithm</span>
            <span className="hero-info-value">SHA-256</span>
          </div>
          <div className="hero-info-box">
            <span className="hero-info-label">Audit Privacy Enforced</span>
            <span className="hero-info-value" style={{ color: "#34d399" }}>Zero Voter PII</span>
          </div>
        </div>
      </div>

      {/* Verification Status Banner */}
      {verificationResult && (
        <div
          className={`chain-verification-banner ${
            verificationResult.isValid ? "valid" : "invalid"
          }`}
        >
          <div className="verification-icon-col">
            {verificationResult.isValid ? (
              <CheckCircle2 size={26} />
            ) : (
              <AlertCircle size={26} />
            )}
          </div>
          <div className="verification-content-col">
            <div className="verification-title-row">
              <h4>
                {verificationResult.isValid
                  ? "Cryptographic Verification Passed: Chain Intact"
                  : "Cryptographic Tampering Detected!"}
              </h4>
              <span className="verification-timestamp">
                Verified at {formatDateTime(verificationResult.verifiedAt)}
              </span>
            </div>
            <p className="verification-detail">
              {verificationResult.isValid
                ? `Successfully recalculated SHA-256 hashes for all ${verificationResult.totalBlocks} blocks. Every previous-hash reference matches and zero data modifications were found.`
                : `Tamper alert at Block #${verificationResult.brokenBlockIndex}: ${verificationResult.reason}`}
            </p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="form-alert error" style={{ marginBottom: "20px" }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="results-kpi-grid">
        <div className="results-kpi-card">
          <div className="kpi-icon blue">
            <Blocks size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Ledger Length</span>
            <h4 className="kpi-val">{totalBlocks}</h4>
            <span className="kpi-sub">Cryptographically linked blocks</span>
          </div>
        </div>

        <div className="results-kpi-card">
          <div className="kpi-icon purple">
            <Hash size={18} />
          </div>
          <div className="kpi-info" style={{ minWidth: 0 }}>
            <span className="kpi-label">Latest Block Hash</span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="font-mono hash-truncate" title={summary?.latestBlock?.hash || ""}>
                {summary?.latestBlock?.hash
                  ? `${summary.latestBlock.hash.substring(0, 10)}...${summary.latestBlock.hash.substring(56)}`
                  : "Genesis Initialized"}
              </span>
              {summary?.latestBlock?.hash && (
                <button
                  type="button"
                  className="icon-copy-btn"
                  onClick={() => handleCopy(summary.latestBlock.hash)}
                  title="Copy full hash"
                >
                  {copiedHash === summary.latestBlock.hash ? (
                    <Check size={12} color="#10b981" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              )}
            </div>
            <span className="kpi-sub">Block #{summary?.latestBlock?.index ?? 0}</span>
          </div>
        </div>

        <div className="results-kpi-card">
          <div className="kpi-icon green">
            <ShieldCheck size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Chain Health</span>
            <h4 className="kpi-val" style={{ color: verificationResult?.isValid === false ? "#f87171" : "#34d399" }}>
              {verificationResult
                ? verificationResult.isValid
                  ? "Verified Intact"
                  : "Tampered"
                : "Operational"}
            </h4>
            <span className="kpi-sub">
              {isAdmin ? "Click 'Verify' to test integrity" : "Protected audit ledger"}
            </span>
          </div>
        </div>

        <div className="results-kpi-card">
          <div className="kpi-icon amber">
            <Clock3 size={18} />
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Latest Activity</span>
            <h4 className="kpi-val" style={{ fontSize: "15px" }}>
              {summary?.latestBlock?.eventType || "GENESIS"}
            </h4>
            <span className="kpi-sub">
              {formatDateTime(summary?.latestBlock?.timestamp)}
            </span>
          </div>
        </div>
      </div>

      {/* Voter Non-Admin Notice */}
      {!isAdmin && (
        <div className="voter-status-banner inactive" style={{ marginBottom: "22px" }}>
          <ShieldCheck size={20} />
          <div>
            <strong>Voter View: Blockchain Summary Active</strong>
            <p>
              As a registered voter, you can inspect the verified blockchain state and block totals.
              Granular block-by-block inspection and cryptographic verification execution are reserved for election administrators.
            </p>
          </div>
        </div>
      )}

      {/* Admin Block List & Explorer */}
      {isAdmin && (
        <div className="panel audit-blocks-panel">
          <div className="panel-heading" style={{ flexWrap: "wrap", gap: "14px" }}>
            <div>
              <div className="section-kicker">BLOCK EXPLORER</div>
              <h3>Sequential Blockchain Ledger</h3>
              <p>Chronological chain of verified blocks from newest to genesis.</p>
            </div>

            {/* Filter Pills */}
            <div className="audit-filters-row">
              {["ALL", "VOTES", "ELECTIONS", "CANDIDATES", "GENESIS"].map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`audit-filter-pill ${filterType === type ? "active" : ""}`}
                  onClick={() => setFilterType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="empty-elections-card" style={{ padding: "50px 20px" }}>
              <RefreshCw size={28} className="spinner" />
              <p style={{ marginTop: "10px", color: "#94a3b8" }}>
                Querying MongoDB Atlas and parsing cryptographic block chain...
              </p>
            </div>
          ) : filteredBlocks.length === 0 ? (
            <div className="empty-elections-card" style={{ padding: "40px 20px" }}>
              <Blocks size={32} />
              <p style={{ marginTop: "10px", color: "#94a3b8" }}>
                No blocks match the &quot;{filterType}&quot; filter.
              </p>
            </div>
          ) : (
            <div className="blocks-timeline">
              {filteredBlocks.map((block) => (
                <div className="block-card" key={block.id || block.index}>
                  <div className="block-header">
                    <div className="block-index-row">
                      <span className="block-number-badge">
                        Block #{block.index}
                      </span>
                      <span className={getEventBadgeClass(block.eventType)}>
                        {getEventIcon(block.eventType)}
                        {block.eventType}
                      </span>
                    </div>

                    <span className="block-timestamp">
                      <Clock3 size={12} />
                      {formatDateTime(block.timestamp)}
                    </span>
                  </div>

                  {/* Hash Linkage View */}
                  <div className="block-hashes-box">
                    <div className="hash-row">
                      <span className="hash-label">
                        <LinkIcon size={12} /> Prev Hash:
                      </span>
                      <span className="font-mono hash-val" title={block.previousHash}>
                        {block.previousHash}
                      </span>
                      <button
                        type="button"
                        className="icon-copy-btn"
                        onClick={() => handleCopy(block.previousHash)}
                        title="Copy previous hash"
                      >
                        {copiedHash === block.previousHash ? (
                          <Check size={11} color="#10b981" />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                    </div>

                    <div className="hash-link-arrow">↓ SHA-256 HASH LINKAGE</div>

                    <div className="hash-row current-hash">
                      <span className="hash-label">
                        <Hash size={12} /> Block Hash:
                      </span>
                      <span className="font-mono hash-val current" title={block.hash}>
                        {block.hash}
                      </span>
                      <button
                        type="button"
                        className="icon-copy-btn"
                        onClick={() => handleCopy(block.hash)}
                        title="Copy block hash"
                      >
                        {copiedHash === block.hash ? (
                          <Check size={11} color="#10b981" />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Metadata display */}
                  {block.metadata && Object.keys(block.metadata).length > 0 && (
                    <div className="block-metadata-box">
                      <span className="metadata-label">Verified Event Payload:</span>
                      <pre className="metadata-pre">
                        {JSON.stringify(block.metadata, null, 2)}
                      </pre>
                    </div>
                  )}

                  {block.electionId && (
                    <div className="block-election-ref">
                      <span>Election Reference:</span>
                      <span className="font-mono">{block.electionId}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Academic Disclaimer & Security Note */}
      <div className="privacy-assurance-card" style={{ marginTop: "24px" }}>
        <div className="privacy-icon">
          <ShieldCheck size={22} />
        </div>
        <div className="privacy-copy">
          <h4>Cryptographic Tamper-Evidence (Academic Prototype Note)</h4>
          <p>
            BlockVote employs SHA-256 hash chaining to provide mathematical tamper-evidence. Any alteration to a block&apos;s
            timestamp, metadata, or previous hash breaks the cryptographic chain at that exact index and is flagged during verification.
            Note: As an academic software project, this ledger is stored in MongoDB and guarantees internal tamper-evidence,
            differing from a decentralized proof-of-work or multi-node consensus network.
          </p>
        </div>
      </div>
    </div>
  );
}
