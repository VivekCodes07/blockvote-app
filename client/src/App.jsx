
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Vote,
  Users,
  Blocks,
  ShieldCheck,
  Bell,
  Search,
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  Menu,
  X,
  Fingerprint,
  Activity,
  UserPlus,
  ArrowLeft,
  Mail,
  Lock,
  User,
  AlertCircle,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  Trash2,
  Calendar,
  ChevronRight,
} from "lucide-react";
import "./App.css";

const activities = [
  {
    icon: CheckCircle2,
    title: "Vote recorded successfully",
    detail: "Student Council Election",
    time: "2 minutes ago",
    color: "green",
  },
  {
    icon: Blocks,
    title: "New block added to chain",
    detail: "Block #1,249 · Hash verified",
    time: "18 minutes ago",
    color: "purple",
  },
  {
    icon: ShieldCheck,
    title: "Voter verification completed",
    detail: "Identity check successful",
    time: "32 minutes ago",
    color: "blue",
  },
];

const getInitials = (name) => {
  if (!name) return "VK";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

function App() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking"); // "checking" | "connected" | "disconnected"
  const [dbStatus, setDbStatus] = useState("checking"); // "checking" | "connected" | "disconnected"

  // Elections live state
  const [electionsList, setElectionsList] = useState([]);
  const [electionsLoading, setElectionsLoading] = useState(false);
  const [electionsError, setElectionsError] = useState(null);
  const [selectedElectionId, setSelectedElectionId] = useState(null);

  // Voter's past participations (Feature 7)
  const [participatedElectionIds, setParticipatedElectionIds] = useState([]);

  // Active voter session (restored from localStorage)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("blockvote_auth");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.token && parsed.voter) {
          return parsed;
        }
      }
    } catch {
      // Ignore corrupted localStorage
    }
    return null;
  });

  // Verify stored session token on mount
  useEffect(() => {
    if (!currentUser?.token) return;

    let isMounted = true;
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${currentUser.token}` },
    })
      .then((res) => {
        if (!res.ok) {
          if (isMounted) {
            localStorage.removeItem("blockvote_auth");
            setCurrentUser(null);
          }
        } else {
          return res.json().then((data) => {
            if (isMounted && data.success && data.voter) {
              setCurrentUser((prev) => (prev ? { ...prev, voter: data.voter } : null));
            }
          });
        }
      })
      .catch(() => {
        // Offline / network failure: retain offline cached session
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser?.token]);

  // Load voter participations on session load/update (Feature 7)
  useEffect(() => {
    if (!currentUser?.token || currentUser?.voter?.role !== "voter") {
      return;
    }

    let isMounted = true;
    fetch("/api/votes/my-participations", {
      headers: { Authorization: `Bearer ${currentUser.token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.success && Array.isArray(data.participatedElectionIds)) {
          setParticipatedElectionIds(data.participatedElectionIds);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentUser?.token, currentUser?.voter?.role]);

  const handleLoginSuccess = (authData) => {
    localStorage.setItem("blockvote_auth", JSON.stringify(authData));
    setCurrentUser(authData);
    setActiveNav("Dashboard");
  };

  const handleSignOut = () => {
    localStorage.removeItem("blockvote_auth");
    setCurrentUser(null);
    setParticipatedElectionIds([]);
  };

  const handleVoteSuccess = (electionId) => {
    setParticipatedElectionIds((prev) =>
      prev.includes(electionId) ? prev : [...prev, electionId]
    );
    fetchElections();
  };

  const fetchElections = async () => {
    setElectionsLoading(true);
    setElectionsError(null);
    try {
      const headers = {};
      if (currentUser?.token) {
        headers["Authorization"] = `Bearer ${currentUser.token}`;
      }
      const response = await fetch("/api/elections", { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success && Array.isArray(data.elections)) {
        setElectionsList(data.elections);
      }
    } catch {
      setElectionsError("Unable to load elections from the server.");
    } finally {
      setElectionsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const headers = {};
    if (currentUser?.token) {
      headers["Authorization"] = `Bearer ${currentUser.token}`;
    }

    fetch("/api/elections", { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted && data.success && Array.isArray(data.elections)) {
          setElectionsList(data.elections);
        }
      })
      .catch(() => {
        if (isMounted) setElectionsError("Unable to load elections from the server.");
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser?.token]);

  useEffect(() => {
    let isMounted = true;

    const checkBackendHealth = async () => {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (isMounted) {
          if (data && data.success === true && data.status === "healthy") {
            setBackendStatus("connected");
          } else {
            setBackendStatus("disconnected");
          }
        }
      } catch {
        if (isMounted) {
          setBackendStatus("disconnected");
        }
      }
    };

    const checkDbStatus = async () => {
      try {
        const response = await fetch("/api/db-status");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (isMounted) {
          if (data && data.success === true && data.connected === true) {
            setDbStatus("connected");
          } else {
            setDbStatus("disconnected");
          }
        }
      } catch {
        if (isMounted) {
          setDbStatus("disconnected");
        }
      }
    };

    checkBackendHealth();
    checkDbStatus();
    const intervalId = setInterval(() => {
      checkBackendHealth();
      checkDbStatus();
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const navigation = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Elections", icon: Vote },
    { label: "Voters", icon: Users },
    { label: "Blockchain Explorer", icon: Blocks },
  ];

  const filteredLiveElections = electionsList.filter((election) =>
    election.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="mobile-overlay"
          aria-label="Close menu"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon">
            <Blocks size={23} />
          </div>
          <div>
            <h2>BlockVote</h2>
            <span>SECURE ELECTIONS</span>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${activeNav === label ? "nav-active" : ""}`}
              onClick={() => {
                setActiveNav(label);
                setMobileMenu(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === "Elections" && <span className="nav-count">{electionsList.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-card">
            <div className="security-icon">
              <ShieldCheck size={20} />
            </div>
            <h4>System services</h4>
            <p>Live platform connectivity</p>
            <div className="status-rows">
              <div className={`security-status ${backendStatus}`}>
                <span className={`status-dot ${backendStatus}`} />
                <span>
                  Backend:{" "}
                  {backendStatus === "connected"
                    ? "Connected"
                    : backendStatus === "checking"
                    ? "Checking..."
                    : "Offline"}
                </span>
              </div>
              <div className={`security-status ${dbStatus}`}>
                <span className={`status-dot ${dbStatus}`} />
                <span>
                  MongoDB:{" "}
                  {dbStatus === "connected"
                    ? "Connected"
                    : dbStatus === "checking"
                    ? "Checking..."
                    : "Disconnected"}
                </span>
              </div>
            </div>
          </div>

          <button
            className={`nav-item ${activeNav === "Settings" ? "nav-active" : ""}`}
            onClick={() => setActiveNav("Settings")}
          >
            <Activity size={19} />
            <span>System Settings</span>
          </button>

          <div className="profile">
            <div className="avatar">{getInitials(currentUser?.voter?.fullName)}</div>
            <div className="profile-info">
              <strong>{currentUser ? currentUser.voter.fullName : "Guest Voter"}</strong>
              <span>{currentUser ? currentUser.voter.email : "Not signed in"}</span>
            </div>
            {currentUser ? (
              <button
                type="button"
                className="icon-button profile-signout"
                onClick={handleSignOut}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="icon-button profile-signin"
                onClick={() => setActiveNav("Voters")}
                title="Sign in"
                aria-label="Sign in"
              >
                <LogIn size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button menu-trigger"
            onClick={() => setMobileMenu(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{activeNav}</strong>
          </div>

          <div className="topbar-actions">
            <div className="search-box">
              <Search size={17} />
              <input
                placeholder="Search elections..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <button className="icon-button notification-button" aria-label="Notifications">
              <Bell size={19} />
              <span />
            </button>
            <div
              className="avatar top-avatar"
              title={currentUser ? `${currentUser.voter.fullName} (${currentUser.voter.email})` : "Guest Voter"}
              onClick={() => !currentUser && setActiveNav("Voters")}
              style={{ cursor: currentUser ? "default" : "pointer" }}
            >
              {getInitials(currentUser?.voter?.fullName)}
            </div>
          </div>
        </header>

        <div className="page-content">
          {activeNav === "Voters" || activeNav === "Register" ? (
            <VoterAuthView
              onBack={() => setActiveNav("Dashboard")}
              onLoginSuccess={handleLoginSuccess}
              currentUser={currentUser}
              onSignOut={handleSignOut}
            />
          ) : activeNav === "Elections" ? (
            <ElectionsView
              currentUser={currentUser}
              elections={electionsList}
              loading={electionsLoading}
              error={electionsError}
              onRefresh={fetchElections}
              onGoToLogin={() => setActiveNav("Voters")}
              selectedElectionId={selectedElectionId}
              setSelectedElectionId={setSelectedElectionId}
              participatedElectionIds={participatedElectionIds}
              onVoteSuccess={handleVoteSuccess}
            />
          ) : (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="status-dot" />
                    ELECTION MANAGEMENT PORTAL
                  </div>
                  <h1>
                    Welcome back<span className="heading-period">.</span>
                  </h1>
                  <p className="welcome-subtitle">
                    Your elections, verified and transparent.
                  </p>
                </div>
                <div className="welcome-actions">
                  {currentUser ? (
                    <button
                      type="button"
                      className="secondary-action-button"
                      onClick={() => setActiveNav("Voters")}
                    >
                      <User size={15} />
                      {currentUser.voter.fullName.split(" ")[0]}'s Account
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-action-button"
                      onClick={() => setActiveNav("Voters")}
                    >
                      <UserPlus size={16} />
                      Sign In / Register
                    </button>
                  )}
                  <button
                    className="primary-button"
                    onClick={() => setActiveNav("Elections")}
                  >
                    <Vote size={17} />
                    Explore elections
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              </section>

              <section className="stats-grid">
                <StatCard
                  icon={Vote}
                  label="Total Elections"
                  value={electionsList.length.toString()}
                  change={
                    currentUser?.voter?.role === "admin"
                      ? "Manage campus elections"
                      : "Verified campus elections"
                  }
                  tone="purple"
                  onClick={() => setActiveNav("Elections")}
                />
                <StatCard
                  icon={Users}
                  label="Registered Voters"
                  value="2,486"
                  change="Register new voter"
                  tone="blue"
                  onClick={() => setActiveNav("Voters")}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Votes Recorded"
                  value="4,892"
                  change="Illustrative demo data"
                  tone="green"
                />
                <StatCard
                  icon={Blocks}
                  label="Blockchain Blocks"
                  value="4,892"
                  change="Demo chain overview"
                  tone="orange"
                />
              </section>

          <section className="content-grid">
            <div className="panel elections-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">OVERVIEW</div>
                  <h2>Elections</h2>
                  <p>Track ongoing and upcoming campus elections.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActiveNav("Elections")}
                >
                  View all <ArrowUpRight size={15} />
                </button>
              </div>

              <div className="election-list">
                {electionsLoading ? (
                  <div className="empty-state" style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                    <Loader2 size={16} className="spinner" />
                    Loading campus elections...
                  </div>
                ) : filteredLiveElections.length > 0 ? (
                  filteredLiveElections.map((election) => (
                    <div
                      className="election-item"
                      key={election.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setSelectedElectionId(election.id);
                        setActiveNav("Elections");
                      }}
                    >
                      <div className={`election-icon ${election.status.toLowerCase()}`}>
                        <Vote size={20} />
                      </div>
                      <div className="election-main">
                        <h3>{election.title}</h3>
                        <div className="election-meta">
                          <span>
                            <Users size={14} /> {election.candidateCount} candidate{election.candidateCount !== 1 ? "s" : ""}
                          </span>
                          <span>
                            <Clock3 size={14} /> Ends {formatDate(election.endDate)}
                          </span>
                        </div>
                        <div className="election-progress">
                          <span
                            className={`progress-fill ${
                              election.status === "Active"
                                ? "purple"
                                : election.status === "Scheduled"
                                ? "blue"
                                : "green"
                            }`}
                            style={{
                              width:
                                election.status === "Completed"
                                  ? "100%"
                                  : election.status === "Active"
                                  ? "68%"
                                  : "0%",
                            }}
                          />
                        </div>
                      </div>
                      <div className="election-right">
                        {participatedElectionIds.includes(election.id) && (
                          <span className="voted-badge" style={{ marginBottom: "2px" }}>
                            <CheckCircle2 size={12} /> Ballot Submitted
                          </span>
                        )}
                        <span className={`status-pill ${election.status.toLowerCase()}`}>
                          {election.status}
                        </span>
                        <strong>{election.voteCount.toLocaleString()}</strong>
                        <span className="vote-caption">votes</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    {search ? `No elections match "${search}".` : "No elections found in database."}{" "}
                    {currentUser?.voter?.role === "admin" ? (
                      <button
                        type="button"
                        className="auth-toggle-button"
                        onClick={() => setActiveNav("Elections")}
                      >
                        Create first election
                      </button>
                    ) : (
                      "Check back when an election is announced."
                    )}
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <span>Real-time election monitor</span>
                <button onClick={() => setSearch("")}>Reset search</button>
              </div>
            </div>

            <div className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">LIVE MONITOR</div>
                  <h2>Recent activity</h2>
                  <p>Illustrative system events.</p>
                </div>
                <span className="live-indicator">
                  <span className="status-dot" /> DEMO
                </span>
              </div>

              <div className="activity-list">
                {activities.map(({ icon: Icon, title, detail, time, color }) => (
                  <div className="activity-item" key={title}>
                    <div className={`activity-icon ${color}`}>
                      <Icon size={17} />
                    </div>
                    <div className="activity-copy">
                      <h4>{title}</h4>
                      <p>{detail}</p>
                      <span>{time}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="activity-link"
                onClick={() => setActiveNav("Blockchain Explorer")}
              >
                Explore blockchain activity <ArrowUpRight size={15} />
              </button>
            </div>
          </section>

          <section className="blockchain-banner">
            <div className="banner-icon">
              <Fingerprint size={25} />
            </div>
            <div className="banner-copy">
              <div className="banner-title-row">
                <h3>Blockchain integrity overview</h3>
                <span className="demo-tag">PREVIEW</span>
              </div>
              <p>
                Each recorded block will link to the previous block's hash.
                Real validation will be connected in a later step.
              </p>
            </div>
            <div className="chain-status">
              <span className="chain-status-icon">
                <ShieldCheck size={17} />
              </span>
              <div>
                <strong>Preview mode</strong>
                <span>
                  {backendStatus === "connected" && "Backend connected · Chain unverified"}
                  {backendStatus === "checking" && "Checking backend..."}
                  {backendStatus === "disconnected" && "Backend offline"}
                </span>
              </div>
            </div>
            <button
              className="banner-button"
              onClick={() => setActiveNav("Blockchain Explorer")}
            >
              View explorer <ArrowUpRight size={16} />
            </button>
          </section>

          <footer className="page-footer">
            <span>BlockVote <span className="footer-dot">·</span> Academic project prototype</span>
            <span><ShieldCheck size={14} /> Transparency by design</span>
          </footer>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function VoterAuthView({ onBack, onLoginSuccess, currentUser, onSignOut }) {
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const switchMode = (mode) => {
    setAuthMode(mode);
    setError(null);
    setSuccess(null);
    setFormData({
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    });
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const { email, password } = formData;

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Invalid credentials. Please try again.");
      } else {
        // Clear sensitive password fields
        setFormData({
          fullName: "",
          email: "",
          password: "",
          confirmPassword: "",
        });
        onLoginSuccess({
          token: data.token,
          voter: data.voter,
        });
      }
    } catch {
      setError("Unable to connect to the authentication service. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const { fullName, email, password, confirmPassword } = formData;

    // Client-side validations
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Registration failed. Please try again.");
      } else {
        setSuccess({
          message: data.message,
          voter: data.voter,
        });
        // Clear sensitive password fields and reset form
        setFormData({
          fullName: "",
          email: "",
          password: "",
          confirmPassword: "",
        });
      }
    } catch {
      setError("Unable to connect to the server. Please check your network.");
    } finally {
      setLoading(false);
    }
  };

  if (currentUser) {
    return (
      <div className="registration-container">
        <button type="button" className="back-button" onClick={onBack}>
          <ArrowLeft size={15} />
          Back to Dashboard
        </button>

        <div className="registration-card">
          <div className="registration-header">
            <div className="registration-badge">
              <ShieldCheck size={14} />
              <span>AUTHENTICATED VOTER SESSION</span>
            </div>
            <h2>Active Voter Session</h2>
            <p>You are authenticated and ready to participate in upcoming elections.</p>
          </div>

          <div className="active-session-card">
            <div className="session-info">
              <div className="session-avatar">{getInitials(currentUser.voter.fullName)}</div>
              <div className="session-details">
                <strong>{currentUser.voter.fullName}</strong>
                <span>{currentUser.voter.email}</span>
              </div>
            </div>

            <div className="session-actions">
              <button
                type="button"
                className="secondary-action-button"
                onClick={onSignOut}
              >
                <LogOut size={15} />
                Sign Out
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={onBack}
              >
                Continue to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="registration-container">
      <button type="button" className="back-button" onClick={onBack}>
        <ArrowLeft size={15} />
        Back to Dashboard
      </button>

      <div className="registration-card">
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${authMode === "login" ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            <LogIn size={15} />
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${authMode === "register" ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            <UserPlus size={15} />
            Register
          </button>
        </div>

        <div className="registration-header">
          <div className="registration-badge">
            {authMode === "login" ? <LogIn size={14} /> : <UserPlus size={14} />}
            <span>{authMode === "login" ? "VOTER AUTHENTICATION" : "VOTER ONBOARDING"}</span>
          </div>
          <h2>{authMode === "login" ? "Sign In to BlockVote" : "Register New Voter"}</h2>
          <p>
            {authMode === "login"
              ? "Access your academic voting session. Sessions are secured with JSON Web Tokens."
              : "Create an academic voter profile. Passwords are cryptographically hashed using bcrypt."}
          </p>
        </div>

        {error && (
          <div className="form-alert error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="form-alert success" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>{success.message}</strong>
              <p>Registered: {success.voter.fullName} ({success.voter.email})</p>
            </div>
          </div>
        )}

        {authMode === "login" ? (
          <form onSubmit={handleLoginSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <div className="input-wrapper">
                <Mail size={16} />
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  className="form-input"
                  placeholder="name@college.edu"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <div className="input-wrapper">
                <Lock size={16} />
                <input
                  id="login-password"
                  type="password"
                  name="password"
                  className="form-input"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  Authenticating...
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  Sign In
                </>
              )}
            </button>

            <div className="auth-toggle-text">
              Don't have a voter account?{" "}
              <button
                type="button"
                className="auth-toggle-button"
                onClick={() => switchMode("register")}
              >
                Register here
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="reg-fullname">Full Name</label>
              <div className="input-wrapper">
                <User size={16} />
                <input
                  id="reg-fullname"
                  type="text"
                  name="fullName"
                  className="form-input"
                  placeholder="e.g. Jane Doe"
                  value={formData.fullName}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="name"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="reg-email">Email Address</label>
              <div className="input-wrapper">
                <Mail size={16} />
                <input
                  id="reg-email"
                  type="email"
                  name="email"
                  className="form-input"
                  placeholder="name@college.edu"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <div className="input-wrapper">
                <Lock size={16} />
                <input
                  id="reg-password"
                  type="password"
                  name="password"
                  className="form-input"
                  placeholder="Minimum 6 characters"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="reg-confirm-password">Confirm Password</label>
              <div className="input-wrapper">
                <Lock size={16} />
                <input
                  id="reg-confirm-password"
                  type="password"
                  name="confirmPassword"
                  className="form-input"
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              className="submit-button"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  Registering voter...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Register Voter
                </>
              )}
            </button>

            <div className="auth-toggle-text">
              Already registered as a voter?{" "}
              <button
                type="button"
                className="auth-toggle-button"
                onClick={() => switchMode("login")}
              >
                Sign in here
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ElectionsView({
  currentUser,
  elections,
  loading,
  error,
  onRefresh,
  onGoToLogin,
  selectedElectionId,
  setSelectedElectionId,
  participatedElectionIds = [],
  onVoteSuccess,
}) {
  const isAdmin = currentUser?.voter?.role === "admin";
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedElectionData, setSelectedElectionData] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

  // Voting state (Feature 7)
  const [voterParticipation, setVoterParticipation] = useState({
    electionId: null,
    hasVoted: false,
    participatedAt: null,
  });
  const [selectedCandidateForVote, setSelectedCandidateForVote] = useState(null);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voteError, setVoteError] = useState(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Action toast message
  const [actionNotice, setActionNotice] = useState(null);

  // Create Election form state
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    isDraft: false,
  });

  // Candidate form state
  const [candidateForm, setCandidateForm] = useState({
    name: "",
    party: "",
    biography: "",
    imageUrl: "",
  });

  // Fetch election details when an election is selected
  useEffect(() => {
    if (!selectedElectionId) {
      return;
    }

    let isMounted = true;
    const headers = {};
    if (currentUser?.token) {
      headers["Authorization"] = `Bearer ${currentUser.token}`;
    }

    fetch(`/api/elections/${selectedElectionId}`, { headers })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Election not found or draft restricted to administrators.");
          }
          throw new Error("Failed to load election details.");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted && data.success) {
          setSelectedElectionData(data);
          setDetailsError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setDetailsError(err.message || "Failed to load election details.");
        }
      })
      .finally(() => {
        if (isMounted) setLoadingDetails(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedElectionId, currentUser?.token]);

  // Check participation status for the selected election (Feature 7)
  useEffect(() => {
    if (!selectedElectionId || !currentUser?.token || currentUser?.voter?.role !== "voter") {
      return;
    }

    let isMounted = true;
    fetch(`/api/votes/status/${selectedElectionId}`, {
      headers: { Authorization: `Bearer ${currentUser.token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.success) {
          setVoterParticipation({
            electionId: selectedElectionId,
            hasVoted: Boolean(data.hasVoted),
            participatedAt: data.participatedAt || null,
          });
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [selectedElectionId, currentUser?.token, currentUser?.voter?.role]);

  const handleCastVoteSubmit = async () => {
    if (!selectedCandidateForVote || !selectedElectionData?.election) return;
    setVoteError(null);
    setVoteSubmitting(true);

    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentUser.token}`,
        },
        body: JSON.stringify({
          electionId: selectedElectionData.election.id,
          candidateId: selectedCandidateForVote.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setVoteError(data.message || "Failed to submit your vote.");
      } else {
        setShowVoteModal(false);
        setVoterParticipation({
          electionId: selectedElectionData.election.id,
          hasVoted: true,
          participatedAt: new Date().toISOString(),
        });
        setActionNotice("Your vote has been cast successfully! Your choice has been recorded anonymously.");
        if (onVoteSuccess) {
          onVoteSuccess(selectedElectionData.election.id);
        }
        await refreshDetails();
        await onRefresh();
      }
    } catch {
      setVoteError("Network error: Unable to connect to voting service. Please try again.");
    } finally {
      setVoteSubmitting(false);
    }
  };

  const refreshDetails = async () => {
    if (!selectedElectionId) return;
    const headers = {};
    if (currentUser?.token) {
      headers["Authorization"] = `Bearer ${currentUser.token}`;
    }
    try {
      const res = await fetch(`/api/elections/${selectedElectionId}`, { headers });
      const data = await res.json();
      if (data.success) {
        setSelectedElectionData(data);
      }
    } catch {
      // Ignore
    }
  };

  const handleCreateElectionSubmit = async (e) => {
    e.preventDefault();
    setModalError(null);

    const { title, description, startDate, endDate, isDraft } = createForm;

    if (!title.trim() || !description.trim() || !startDate || !endDate) {
      setModalError("Please complete all required fields.");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setModalError("Please provide valid dates and times.");
      return;
    }

    if (end <= start) {
      setModalError("End date must be later than the start date.");
      return;
    }

    setModalLoading(true);

    try {
      const res = await fetch("/api/elections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentUser.token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          isDraft: Boolean(isDraft),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setModalError(data.message || "Failed to create election.");
      } else {
        setShowCreateModal(false);
        setCreateForm({
          title: "",
          description: "",
          startDate: "",
          endDate: "",
          isDraft: false,
        });
        await onRefresh();
        setSelectedElectionId(data.election.id);
        setActionNotice(`Election "${data.election.title}" created successfully!`);
      }
    } catch {
      setModalError("Server connection failed. Please try again.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleAddCandidateSubmit = async (e) => {
    e.preventDefault();
    setModalError(null);

    const { name, party, biography, imageUrl } = candidateForm;

    if (!name.trim() || !party.trim()) {
      setModalError("Candidate name and party/affiliation are required.");
      return;
    }

    setModalLoading(true);

    try {
      const res = await fetch(`/api/elections/${selectedElectionId}/candidates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentUser.token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          party: party.trim(),
          biography: biography.trim(),
          imageUrl: imageUrl.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setModalError(data.message || "Failed to add candidate.");
      } else {
        setShowCandidateModal(false);
        setCandidateForm({ name: "", party: "", biography: "", imageUrl: "" });
        await refreshDetails();
        await onRefresh();
        setActionNotice(`Candidate "${data.candidate.name}" added to slate!`);
      }
    } catch {
      setModalError("Server connection failed. Please try again.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteElection = async (electionId, electionTitle, voteCount) => {
    if (voteCount > 0) {
      alert("Security Constraint: Cannot delete an election after votes have been recorded.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${electionTitle}"? This will permanently delete the election and all candidate nominations.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/elections/${electionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || "Failed to delete election.");
      } else {
        if (selectedElectionId === electionId) {
          setSelectedElectionId(null);
          setSelectedElectionData(null);
        }
        await onRefresh();
        setActionNotice(`Election "${electionTitle}" deleted successfully.`);
      }
    } catch {
      alert("Network error: Could not complete election deletion.");
    }
  };

  const handleRemoveCandidate = async (candidateId, candidateName) => {
    if (!selectedElectionData?.election) return;
    const el = selectedElectionData.election;

    if (el.voteCount > 0) {
      alert("Security Constraint: Cannot remove a candidate after votes have been recorded.");
      return;
    }

    const confirmed = window.confirm(`Remove candidate "${candidateName}" from this election slate?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/elections/${el.id}/candidates/${candidateId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${currentUser.token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || "Failed to remove candidate.");
      } else {
        await refreshDetails();
        await onRefresh();
        setActionNotice(`Candidate "${candidateName}" removed from slate.`);
      }
    } catch {
      alert("Network error: Could not remove candidate.");
    }
  };

  // Filter calculations
  const filteredElections = elections.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.description && e.description.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === "all") return true;
    if (activeFilter === "draft") return e.isDraft;
    return e.status?.toLowerCase() === activeFilter.toLowerCase();
  });

  const activeCount = elections.filter((e) => e.status === "Active").length;
  const scheduledCount = elections.filter((e) => e.status === "Scheduled").length;
  const completedCount = elections.filter((e) => e.status === "Completed").length;
  const draftCount = elections.filter((e) => e.isDraft).length;

  const hasUserVoted =
    Boolean(
      (voterParticipation.hasVoted &&
        voterParticipation.electionId === selectedElectionData?.election?.id) ||
        (selectedElectionData?.election?.id &&
          participatedElectionIds.includes(selectedElectionData.election.id))
    );

  return (
    <div className="elections-view-container">
      {/* Top Header */}
      <div className="elections-view-header">
        <div>
          <h1>Campus Elections</h1>
          <p className="elections-view-subtitle">
            Browse verified academic elections, view candidate slates, and track live statuses.
          </p>
        </div>

        <div className="elections-actions-row">
          {isAdmin ? (
            <>
              <span className="admin-badge">
                <ShieldCheck size={14} /> Administrator
              </span>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setModalError(null);
                  setShowCreateModal(true);
                }}
              >
                <Plus size={16} />
                Create Election
              </button>
            </>
          ) : !currentUser ? (
            <button
              type="button"
              className="secondary-action-button"
              onClick={onGoToLogin}
            >
              <UserPlus size={16} />
              Sign In to Vote
            </button>
          ) : (
            <span className="admin-badge" style={{ background: "#3dd68c18", color: "#75dca9", borderColor: "#3dd68c33" }}>
              <ShieldCheck size={14} /> Registered Voter
            </span>
          )}
        </div>
      </div>

      {actionNotice && (
        <div className="form-alert success" role="status" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <CheckCircle2 size={18} />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => setActionNotice(null)}
            aria-label="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Selected Election Detail & Candidate View */}
      {selectedElectionId ? (
        <div className="election-detail-container">
          <button
            type="button"
            className="back-link"
            onClick={() => {
              setSelectedElectionId(null);
              setSelectedElectionData(null);
            }}
          >
            <ArrowLeft size={15} />
            Back to all elections
          </button>

          {loadingDetails ? (
            <div className="empty-elections-card">
              <Loader2 size={24} className="spinner" />
              <p>Loading election details and candidate slate...</p>
            </div>
          ) : detailsError ? (
            <div className="form-alert error">
              <AlertCircle size={18} />
              <span>{detailsError}</span>
            </div>
          ) : selectedElectionData?.election ? (
            <>
              {/* Election Hero Card */}
              <div className="election-detail-hero">
                <div className="hero-top-row">
                  <div className="hero-title-group">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                      <span className={`status-pill ${selectedElectionData.election.status.toLowerCase()}`}>
                        {selectedElectionData.election.status}
                      </span>
                      {selectedElectionData.election.isDraft && (
                        <span className="admin-badge" style={{ background: "#f59e0b22", color: "#fbbf24", borderColor: "#f59e0b44" }}>
                          Unpublished Draft
                        </span>
                      )}
                    </div>
                    <h2>{selectedElectionData.election.title}</h2>
                    <p className="hero-description">{selectedElectionData.election.description}</p>
                  </div>
                </div>

                <div className="hero-info-grid">
                  <div className="hero-info-box">
                    <span className="hero-info-label">Voting Period Start</span>
                    <span className="hero-info-value">{formatDateTime(selectedElectionData.election.startDate)}</span>
                  </div>
                  <div className="hero-info-box">
                    <span className="hero-info-label">Voting Period End</span>
                    <span className="hero-info-value">{formatDateTime(selectedElectionData.election.endDate)}</span>
                  </div>
                  <div className="hero-info-box">
                    <span className="hero-info-label">Candidates Nominated</span>
                    <span className="hero-info-value">{selectedElectionData.candidates?.length || 0}</span>
                  </div>
                  <div className="hero-info-box">
                    <span className="hero-info-label">Recorded Ballots</span>
                    <span className="hero-info-value">{selectedElectionData.election.voteCount.toLocaleString()} votes</span>
                  </div>
                </div>

                {isAdmin && (
                  <div className="hero-admin-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        setModalError(null);
                        setShowCandidateModal(true);
                      }}
                    >
                      <Plus size={15} />
                      Add Candidate
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={selectedElectionData.election.voteCount > 0}
                      title={
                        selectedElectionData.election.voteCount > 0
                          ? "Cannot delete election after votes have been recorded"
                          : "Delete this election"
                      }
                      onClick={() =>
                        handleDeleteElection(
                          selectedElectionData.election.id,
                          selectedElectionData.election.title,
                          selectedElectionData.election.voteCount
                        )
                      }
                    >
                      <Trash2 size={15} />
                      Delete Election
                    </button>
                  </div>
                )}
              </div>

              {/* Voter Participation Status Banner (Feature 7) */}
              {!currentUser ? (
                <div className="voter-status-banner inactive">
                  <LogIn size={20} />
                  <div>
                    <strong>Sign In to Participate</strong>
                    <p>
                      You are viewing this election slate as a guest. Sign in with your registered voter account to cast an anonymous ballot.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-action-button"
                    onClick={onGoToLogin}
                    style={{ marginLeft: "auto", flexShrink: 0 }}
                  >
                    <LogIn size={14} /> Sign In
                  </button>
                </div>
              ) : isAdmin ? (
                <div className="voter-status-banner inactive">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Administrator Account Active</strong>
                    <p>
                      Administrators manage election slates and parameters, but cannot cast ballots to ensure electoral neutrality.
                    </p>
                  </div>
                </div>
              ) : hasUserVoted ? (
                <div className="voter-status-banner voted">
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>Ballot Cast &amp; Verified</strong>
                    <p>
                      You have already voted in this election{voterParticipation.participatedAt ? ` on ${formatDateTime(voterParticipation.participatedAt)}` : ""}. Your choice is recorded anonymously in the ballot box.
                    </p>
                  </div>
                  <span className="voted-badge" style={{ marginLeft: "auto", flexShrink: 0 }}>
                    <CheckCircle2 size={12} /> One Vote Limit Enforced
                  </span>
                </div>
              ) : selectedElectionData.election.status === "Active" ? (
                <div className="voter-status-banner eligible">
                  <Vote size={20} />
                  <div>
                    <strong>Voting is Open · You are eligible to vote</strong>
                    <p>
                      Select your preferred candidate from the slate below. Each registered voter is permitted exactly one anonymous ballot.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="voter-status-banner inactive">
                  <Clock3 size={20} />
                  <div>
                    <strong>Voting Unavailable</strong>
                    <p>
                      {selectedElectionData.election.status === "Scheduled" &&
                        "Voting has not opened yet. Check back when the scheduled voting window begins."}
                      {selectedElectionData.election.status === "Completed" &&
                        "Voting for this election has closed. New ballots can no longer be submitted."}
                      {selectedElectionData.election.status === "Draft" &&
                        "This election is currently an unpublished draft."}
                    </p>
                  </div>
                </div>
              )}

              {/* Candidate Slate Section */}
              <div className="candidates-section">
                <div className="candidates-header">
                  <h3>
                    Candidate Slate ({selectedElectionData.candidates?.length || 0})
                  </h3>
                  {isAdmin && (
                    <button
                      type="button"
                      className="card-action-btn"
                      onClick={() => {
                        setModalError(null);
                        setShowCandidateModal(true);
                      }}
                    >
                      <Plus size={14} />
                      Nominate Candidate
                    </button>
                  )}
                </div>

                {selectedElectionData.candidates?.length > 0 ? (
                  <div className="candidates-grid">
                    {selectedElectionData.candidates.map((candidate) => (
                      <div className="candidate-card" key={candidate.id}>
                        <div className="candidate-top-info">
                          <div className="candidate-avatar">
                            {candidate.imageUrl ? (
                              <img
                                src={candidate.imageUrl}
                                alt={candidate.name}
                                onError={(e) => {
                                  e.target.style.display = "none";
                                }}
                              />
                            ) : (
                              getInitials(candidate.name)
                            )}
                          </div>
                          <div className="candidate-details">
                            <h4 className="candidate-name" title={candidate.name}>
                              {candidate.name}
                            </h4>
                            <span className="candidate-party">{candidate.party}</span>
                          </div>
                        </div>

                        {candidate.biography && (
                          <p className="candidate-bio">{candidate.biography}</p>
                        )}

                        <div className="candidate-footer">
                          <span className="candidate-votes">
                            <strong>{candidate.voteCount}</strong> votes
                          </span>

                          {isAdmin ? (
                            <button
                              type="button"
                              className="danger-button"
                              style={{ padding: "5px 10px", fontSize: "11px" }}
                              disabled={
                                candidate.voteCount > 0 || selectedElectionData.election.voteCount > 0
                              }
                              title={
                                candidate.voteCount > 0 || selectedElectionData.election.voteCount > 0
                                  ? "Cannot remove candidate after voting begins"
                                  : "Remove candidate"
                              }
                              onClick={() => handleRemoveCandidate(candidate.id, candidate.name)}
                            >
                              <Trash2 size={13} />
                              Remove
                            </button>
                          ) : !currentUser ? (
                            selectedElectionData.election.status === "Active" ? (
                              <button
                                type="button"
                                className="card-action-btn"
                                onClick={onGoToLogin}
                                style={{ padding: "6px 12px", fontSize: "12px" }}
                              >
                                <LogIn size={13} /> Sign In
                              </button>
                            ) : null
                          ) : currentUser.voter?.role === "voter" ? (
                            hasUserVoted ? (
                              <span className="voted-badge">
                                <CheckCircle2 size={12} /> Ballot Submitted
                              </span>
                            ) : selectedElectionData.election.status === "Active" ? (
                              <button
                                type="button"
                                className="vote-candidate-btn"
                                onClick={() => {
                                  setSelectedCandidateForVote(candidate);
                                  setVoteError(null);
                                  setShowVoteModal(true);
                                }}
                              >
                                <Vote size={13} /> Vote
                              </button>
                            ) : (
                              <span className="vote-stat-label">
                                Voting {selectedElectionData.election.status.toLowerCase()}
                              </span>
                            )
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-elections-card">
                    <Users size={32} />
                    <h3>No Candidates Nominated Yet</h3>
                    <p>
                      {isAdmin
                        ? "Click 'Add Candidate' above to nominate candidates for this election slate."
                        : "Candidate nominations have not been posted for this election."}
                    </p>
                    {isAdmin && (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                          setModalError(null);
                          setShowCandidateModal(true);
                        }}
                      >
                        <Plus size={15} />
                        Add First Candidate
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        /* Elections List View */
        <>
          {/* Toolbar: Filters and Search */}
          <div className="elections-toolbar">
            <div className="elections-filter-tabs">
              <button
                type="button"
                className={`filter-tab ${activeFilter === "all" ? "active" : ""}`}
                onClick={() => setActiveFilter("all")}
              >
                All <span className="filter-tab-count">{elections.length}</span>
              </button>
              <button
                type="button"
                className={`filter-tab ${activeFilter === "active" ? "active" : ""}`}
                onClick={() => setActiveFilter("active")}
              >
                Active <span className="filter-tab-count">{activeCount}</span>
              </button>
              <button
                type="button"
                className={`filter-tab ${activeFilter === "scheduled" ? "active" : ""}`}
                onClick={() => setActiveFilter("scheduled")}
              >
                Scheduled <span className="filter-tab-count">{scheduledCount}</span>
              </button>
              <button
                type="button"
                className={`filter-tab ${activeFilter === "completed" ? "active" : ""}`}
                onClick={() => setActiveFilter("completed")}
              >
                Completed <span className="filter-tab-count">{completedCount}</span>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className={`filter-tab ${activeFilter === "draft" ? "active" : ""}`}
                  onClick={() => setActiveFilter("draft")}
                >
                  Drafts <span className="filter-tab-count">{draftCount}</span>
                </button>
              )}
            </div>

            <div className="elections-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search elections by title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  style={{ background: "transparent", border: 0, color: "#8c90a6", padding: 0 }}
                  onClick={() => setSearchTerm("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Grid or Status */}
          {loading ? (
            <div className="empty-elections-card">
              <Loader2 size={24} className="spinner" />
              <p>Fetching campus elections...</p>
            </div>
          ) : error ? (
            <div className="form-alert error">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                type="button"
                className="secondary-action-button"
                style={{ marginLeft: "auto", padding: "4px 10px" }}
                onClick={onRefresh}
              >
                Retry
              </button>
            </div>
          ) : filteredElections.length > 0 ? (
            <div className="elections-grid">
              {filteredElections.map((election) => (
                <div className="election-card" key={election.id}>
                  <div className="election-card-header">
                    <div className="election-card-title-row">
                      <div className={`election-card-icon ${election.status.toLowerCase()}`}>
                        <Vote size={19} />
                      </div>
                      <span className={`status-pill ${election.status.toLowerCase()}`}>
                        {election.status}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {participatedElectionIds.includes(election.id) && (
                        <span className="voted-badge">
                          <CheckCircle2 size={12} /> Voted
                        </span>
                      )}
                      {!participatedElectionIds.includes(election.id) &&
                        election.status === "Active" &&
                        currentUser?.voter?.role === "voter" && (
                          <span className="vote-open-badge">
                            <Vote size={12} /> Ready to Vote
                          </span>
                        )}
                      {election.isDraft && (
                        <span className="admin-badge" style={{ background: "#f59e0b1a", color: "#fbbf24", borderColor: "#f59e0b33" }}>
                          Draft
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="election-card-title">{election.title}</h3>
                  <p className="election-card-description">{election.description}</p>

                  <div className="election-card-meta">
                    <div className="meta-row">
                      <Calendar size={13} />
                      <span>Starts: {formatDate(election.startDate)}</span>
                    </div>
                    <div className="meta-row">
                      <Clock3 size={13} />
                      <span>Ends: {formatDate(election.endDate)}</span>
                    </div>
                    <div className="meta-row">
                      <Users size={13} />
                      <span>
                        {election.candidateCount} candidate{election.candidateCount !== 1 ? "s" : ""} nominated
                      </span>
                    </div>
                  </div>

                  <div className="election-card-footer">
                    <div className="vote-stat">
                      <span className="vote-stat-number">{election.voteCount.toLocaleString()}</span>
                      <span className="vote-stat-label">Votes Recorded</span>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      {isAdmin && election.voteCount === 0 && (
                        <button
                          type="button"
                          className="danger-button"
                          style={{ padding: "8px 10px" }}
                          title="Delete election"
                          onClick={() =>
                            handleDeleteElection(election.id, election.title, election.voteCount)
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

                      <button
                        type="button"
                        className="card-action-btn"
                        onClick={() => setSelectedElectionId(election.id)}
                      >
                        {participatedElectionIds.includes(election.id) ? (
                          <>
                            View Details
                            <ChevronRight size={14} />
                          </>
                        ) : election.status === "Active" && currentUser?.voter?.role === "voter" ? (
                          <>
                            <Vote size={14} />
                            Vote Now
                          </>
                        ) : (
                          <>
                            View Slate
                            <ChevronRight size={14} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-elections-card">
              <Vote size={32} />
              <h3>No Elections Found</h3>
              <p>
                {searchTerm
                  ? `No elections match "${searchTerm}". Try adjusting your search query or filter.`
                  : "There are currently no elections matching this category."}
              </p>
              {isAdmin && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setModalError(null);
                    setShowCreateModal(true);
                  }}
                >
                  <Plus size={16} />
                  Create New Election
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal: Create Election (Admin Only) */}
      {showCreateModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Create Campus Election</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !modalLoading && setShowCreateModal(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateElectionSubmit}>
              <div className="modal-body">
                {modalError && (
                  <div className="form-alert error">
                    <AlertCircle size={16} />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="create-title">Election Title *</label>
                  <input
                    id="create-title"
                    type="text"
                    className="form-input"
                    placeholder="e.g. 2026 Student Government President"
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    disabled={modalLoading}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="create-desc">Description *</label>
                  <textarea
                    id="create-desc"
                    className="form-textarea"
                    placeholder="Provide details about the election, eligible voters, and voting rules..."
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    disabled={modalLoading}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="create-start">Start Date & Time *</label>
                    <input
                      id="create-start"
                      type="datetime-local"
                      className="form-input"
                      value={createForm.startDate}
                      onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                      disabled={modalLoading}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="create-end">End Date & Time *</label>
                    <input
                      id="create-end"
                      type="datetime-local"
                      className="form-input"
                      value={createForm.endDate}
                      onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                      disabled={modalLoading}
                      required
                    />
                  </div>
                </div>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={createForm.isDraft}
                    onChange={(e) => setCreateForm({ ...createForm, isDraft: e.target.checked })}
                    disabled={modalLoading}
                  />
                  <span>Save as Draft (hidden from voters until published)</span>
                </label>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-action-button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={modalLoading}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={modalLoading}>
                  {modalLoading ? (
                    <>
                      <Loader2 size={15} className="spinner" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={15} />
                      Create Election
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Candidate (Admin Only) */}
      {showCandidateModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Nominate Candidate</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !modalLoading && setShowCandidateModal(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddCandidateSubmit}>
              <div className="modal-body">
                {modalError && (
                  <div className="form-alert error">
                    <AlertCircle size={16} />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="cand-name">Candidate Full Name *</label>
                  <input
                    id="cand-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Jordan Hayes"
                    value={candidateForm.name}
                    onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })}
                    disabled={modalLoading}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="cand-party">Party or Affiliation *</label>
                  <input
                    id="cand-party"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Campus Progress Alliance / Independent"
                    value={candidateForm.party}
                    onChange={(e) => setCandidateForm({ ...candidateForm, party: e.target.value })}
                    disabled={modalLoading}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="cand-bio">Biography / Platform (Optional)</label>
                  <textarea
                    id="cand-bio"
                    className="form-textarea"
                    placeholder="Brief platform overview, background, or campaign goals..."
                    value={candidateForm.biography}
                    onChange={(e) => setCandidateForm({ ...candidateForm, biography: e.target.value })}
                    disabled={modalLoading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="cand-image">Profile Image URL (Optional)</label>
                  <input
                    id="cand-image"
                    type="url"
                    className="form-input"
                    placeholder="https://example.com/portrait.jpg"
                    value={candidateForm.imageUrl}
                    onChange={(e) => setCandidateForm({ ...candidateForm, imageUrl: e.target.value })}
                    disabled={modalLoading}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-action-button"
                  onClick={() => setShowCandidateModal(false)}
                  disabled={modalLoading}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={modalLoading}>
                  {modalLoading ? (
                    <>
                      <Loader2 size={15} className="spinner" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus size={15} />
                      Add Candidate
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Vote (Feature 7) */}
      {showVoteModal && selectedCandidateForVote && selectedElectionData?.election && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Confirm Your Ballot</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !voteSubmitting && setShowVoteModal(false)}
                aria-label="Close modal"
                disabled={voteSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {voteError && (
                <div className="form-alert error">
                  <AlertCircle size={16} />
                  <span>{voteError}</span>
                </div>
              )}

              <p style={{ margin: "0 0 16px 0", color: "#a5a9c0", fontSize: "14px", lineHeight: "1.5" }}>
                You are about to cast your official ballot for{" "}
                <strong style={{ color: "#fff" }}>{selectedElectionData.election.title}</strong>.
              </p>

              <div className="vote-confirm-box">
                <span className="hero-info-label" style={{ display: "block", marginBottom: "4px" }}>
                  Selected Candidate
                </span>
                <div className="vote-confirm-candidate">
                  {selectedCandidateForVote.name}
                </div>
                <div className="vote-confirm-party">
                  {selectedCandidateForVote.party}
                </div>
              </div>

              <div className="vote-confirm-warning">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>
                  <strong>One-Vote Rule:</strong> Once submitted, your vote is permanent and cannot be changed or recalled. Your participation is recorded to prevent duplicate voting, while your ballot selection remains untraceable to your identity.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-action-button"
                onClick={() => setShowVoteModal(false)}
                disabled={voteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleCastVoteSubmit}
                disabled={voteSubmitting}
              >
                {voteSubmitting ? (
                  <>
                    <Loader2 size={15} className="spinner" />
                    Submitting Ballot...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    Confirm &amp; Submit Vote
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, change, tone, onClick }) {
  return (
    <div
      className={`stat-card ${onClick ? "stat-card-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`stat-icon ${tone}`}>
        <Icon size={20} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-change">
        <span className="change-arrow"><ArrowUpRight size={13} /></span>
        {change}
      </div>
    </div>
  );
}

export default App;
