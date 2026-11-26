import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Crown,
  LogOut,
  Play,
  Plus,
  Users,
  Check,
  Send,
  RotateCcw,
  WifiOff,
  Eraser
} from "lucide-react";

import { supabase, ensureGuest, isConnected } from "./supabase";
import { MODES, PROMPTS, pick } from "./game";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [userId, setUserId] = useState(null);
  const [round, setRound] = useState(null);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState([]);
  const [votes, setVotes] = useState([]);
  const [voteCounts, setVoteCounts] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [canvasColor, setCanvasColor] = useState("#242033");
  const [canvasWidth, setCanvasWidth] = useState(5);

  const canvas = useRef(null);
  const drawing = useRef(false);
  const messageTimer = useRef(null);

  const isHost = room?.host_id === userId;

  const notify = (text) => {
    setMessage(text);

    if (messageTimer.current) {
      clearTimeout(messageTimer.current);
    }

    messageTimer.current = setTimeout(() => {
      setMessage("");
    }, 3500);
  };

  async function refresh(code = room?.code) {
    if (!supabase || !code) return;

    const { data, error } = await supabase.rpc(
      "words_get_room_state",
      { p_code: code }
    );

    if (error) {
      notify(error.message);
      return;
    }

    if (!data?.room) return;

    setRoom(data.room);
    setPlayers(data.players || []);
    setAnswers(data.answers || []);
    setVotes(data.my_votes || []);
    setVoteCounts(data.vote_counts || {});
  }

  useEffect(() => {
    if (!room?.code || !supabase) return;

    refresh(room.code);

    const timer = setInterval(() => {
      refresh(room.code);
    }, 1500);

    return () => clearInterval(timer);
  }, [room?.code]);

  useEffect(() => {
    if (!room) return;

    if (room.state === "playing" && room.current_round) {
      setRound(room.current_round);
      setScreen("game");
    } else if (room.state === "lobby") {
      setScreen("lobby");
    } else if (room.state === "results") {
      setScreen("results");
    }
  }, [room]);

  useEffect(() => {
    return () => {
      if (messageTimer.current) {
        clearTimeout(messageTimer.current);
      }
    };
  }, []);

  async function enterRoom(data) {
    setUserId(data.user_id);
    setRoomCode(data.room.code);
    setRoom(data.room);
    setPlayers(data.players || []);
    setAnswers(data.answers || []);
    setVotes(data.my_votes || []);
    setVoteCounts(data.vote_counts || {});
    setScreen("lobby");
  }

  async function createRoom() {
    if (!name.trim()) {
      notify("Enter your player name first.");
      return;
    }

    if (!isConnected) {
      notify("Words of Chaos is not connected to Supabase.");
      return;
    }

    setBusy(true);

    try {
      const user = await ensureGuest();

      const { data, error } = await supabase.rpc(
        "words_create_room",
        {
          p_name: name.trim().slice(0, 18),
          p_mode: "caption"
        }
      );

      if (error) throw error;

      await enterRoom({
        ...data,
        user_id: user.id
      });
    } catch (error) {
      notify(error.message || "Could not create the room.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!name.trim()) {
      notify("Enter your player name first.");
      return;
    }

    if (roomCode.trim().length !== 4) {
      notify("Enter the four-letter room code.");
      return;
    }

    if (!isConnected) {
      notify("Words of Chaos is not connected to Supabase.");
      return;
    }

    setBusy(true);

    try {
      const user = await ensureGuest();

      const { data, error } = await supabase.rpc(
        "words_join_room",
        {
          p_code: roomCode.trim().toUpperCase(),
          p_name: name.trim().slice(0, 18)
        }
      );

      if (error) throw error;

      await enterRoom({
        ...data,
        user_id: user.id
      });
    } catch (error) {
      notify(error.message || "Could not join the room.");
    } finally {
      setBusy(false);
    }
  }

  async function startGame() {
    if (!isHost) return;

    if (players.length < 2) {
      notify("Invite at least one other player before starting.");
      return;
    }

    const mode = MODES.find(
      (item) => item.id === room.mode
    ) || MODES[0];

    const prompt = pick(PROMPTS[mode.id]);

    const { error } = await supabase.rpc(
      "words_start_game",
      {
        p_code: room.code,
        p_prompt: prompt
      }
    );

    if (error) {
      notify(error.message);
    } else {
      await refresh(room.code);
    }
  }

  async function submitAnswer() {
    if (!answer.trim()) {
      notify("Write an answer first.");
      return;
    }

    const { error } = await supabase.rpc(
      "words_submit_answer",
      {
        p_code: room.code,
        p_content: answer.trim().slice(0, 500),
        p_kind: "text"
      }
    );

    if (error) {
      notify(error.message);
      return;
    }

    setAnswer("");
    notify("Your answer has been submitted.");
    await refresh(room.code);
  }

  async function submitDrawing() {
    const drawingCanvas = canvas.current;

    if (!drawingCanvas) return;

    const dataUrl = drawingCanvas.toDataURL("image/png");

    const { error } = await supabase.rpc(
      "words_submit_answer",
      {
        p_code: room.code,
        p_content: dataUrl,
        p_kind: "drawing"
      }
    );

    if (error) {
      notify(error.message);
    } else {
      notify("Your drawing has been submitted.");
      await refresh(room.code);
    }
  }

  async function finishRound() {
    if (!isHost) return;

    const { error } = await supabase.rpc(
      "words_finish_round",
      { p_code: room.code }
    );

    if (error) {
      notify(error.message);
    } else {
      await refresh(room.code);
    }
  }

  async function nextRound() {
    if (!isHost) return;

    const mode = MODES.find(
      (item) => item.id === room.mode
    ) || MODES[0];

    const prompt = pick(PROMPTS[mode.id]);

    const { error } = await supabase.rpc(
      "words_next_round",
      {
        p_code: room.code,
        p_prompt: prompt
      }
    );

    if (error) {
      notify(error.message);
    } else {
      setAnswer("");
      setVotes([]);
      setVoteCounts({});
      await refresh(room.code);
    }
  }

  async function vote(answerId) {
    if (votes.length > 0) {
      notify("You have already voted this round.");
      return;
    }

    const selected = answers.find(
      (item) => item.id === answerId
    );

    if (!selected) {
      notify("That answer is no longer available.");
      return;
    }

    if (selected.user_id === userId) {
      notify("You cannot vote for your own answer.");
      return;
    }

    const { error } = await supabase.rpc(
      "words_vote_answer",
      {
        p_code: room.code,
        p_answer_id: answerId
      }
    );

    if (error) {
      notify(error.message);
      return;
    }

    await refresh(room.code);
    notify("Your vote has been saved.");
  }

  async function leave() {
    if (room?.code) {
      const { error } = await supabase.rpc(
        "words_leave_room",
        { p_code: room.code }
      );

      if (error) {
        notify(error.message);
        return;
      }
    }

    setRoom(null);
    setPlayers([]);
    setAnswers([]);
    setRound(null);
    setVotes([]);
    setVoteCounts({});
    setUserId(null);
    setScreen("home");
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      notify("Room code copied!");
    } catch {
      notify("Your room code is " + room.code);
    }
  }

  function beginDraw(event) {
    const drawingCanvas = canvas.current;
    if (!drawingCanvas) return;

    drawing.current = true;

    const context = drawingCanvas.getContext("2d");
    const rect = drawingCanvas.getBoundingClientRect();

    context.beginPath();
    context.moveTo(
      ((event.clientX - rect.left) / rect.width) * drawingCanvas.width,
      ((event.clientY - rect.top) / rect.height) * drawingCanvas.height
    );
  }

  function moveDraw(event) {
    if (!drawing.current) return;

    const drawingCanvas = canvas.current;
    if (!drawingCanvas) return;

    const context = drawingCanvas.getContext("2d");
    const rect = drawingCanvas.getBoundingClientRect();

    context.strokeStyle = canvasColor;
    context.lineWidth = canvasWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    context.lineTo(
      ((event.clientX - rect.left) / rect.width) * drawingCanvas.width,
      ((event.clientY - rect.top) / rect.height) * drawingCanvas.height
    );

    context.stroke();
  }

  function endDraw() {
    drawing.current = false;
  }

  function clearCanvas() {
    const drawingCanvas = canvas.current;
    if (!drawingCanvas) return;

    drawingCanvas.getContext("2d").clearRect(
      0,
      0,
      drawingCanvas.width,
      drawingCanvas.height
    );
  }

  const mode = MODES.find(
    (item) => item.id === room?.mode
  ) || MODES[0];

  // Corrected: define the current round's answers before rendering.
  const roundAnswers = answers.filter(
    (item) => item.round_no === round?.number
  );

  const leaderboard = [...players].sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            if (screen !== "home") leave();
          }}
        >
          <span className="brand-mark">W</span>
          <span>WORDS <b>OF CHAOS</b></span>
        </a>

        <div className="top-right">
          <span className="online">
            <i /> LIVE PARTY GAME
          </span>

          {room && (
            <span className="room-pill">
              ROOM {room.code}
            </span>
          )}
        </div>
      </header>

      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}

      {!isConnected && (
        <div className="setup-note">
          <WifiOff size={16} />
          Supabase isn't connected. Check the existing Words of Chaos
          project settings.
        </div>
      )}

      {screen === "home" && (
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> THE PARTY GAME FOR BIG IDEAS & BAD ANSWERS
            </div>

            <h1>
              MAKE WORDS.
              <br />
              <em>MAKE CHAOS.</em>
            </h1>

            <p>
              One room. A whole lot of imagination.
              And absolutely no sensible answers.
            </p>

            <div className="home-actions">
              <div className="panel">
                <label>YOUR PLAYER NAME</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={18}
                  placeholder="What should we call you?"
                />
              </div>

              <div className="home-grid">
                <button
                  className="btn primary"
                  onClick={createRoom}
                  disabled={busy || !isConnected}
                >
                  <Plus /> {busy ? "Creating..." : "Create a room"}
                </button>

                <div className="join-box">
                  <input
                    value={roomCode}
                    onChange={(event) =>
                      setRoomCode(event.target.value.toUpperCase())
                    }
                    maxLength={4}
                    placeholder="ROOM CODE"
                  />

                  <button
                    className="btn secondary"
                    onClick={joinRoom}
                    disabled={busy || !isConnected || roomCode.length !== 4}
                  >
                    <Play size={17} /> Join
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-art">
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <div className="sticker sticker-one">LOL!</div>
            <div className="sticker sticker-two">??</div>
            <div className="sticker sticker-three">✦</div>

            <div className="chaos-card">
              <span className="card-kicker">ROUND 01 / CHAOS</span>
              <div className="speech">
                What if
                <br />
                <strong>bananas</strong>
                <br />
                ran the world?
              </div>
              <div className="scribble">〰</div>
              <div className="card-foot">
                <span>NO WRONG ANSWERS</span>
                <span>✳</span>
              </div>
            </div>
          </div>

          <div className="mode-strip">
            <span>7 WAYS TO PLAY</span>
            {MODES.map((item) => (
              <span key={item.id}>
                {item.icon} {item.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {screen === "lobby" && room && (
        <section className="content-page">
          <div className="page-heading">
            <div className="eyebrow"><span /> YOUR CHAOS HQ</div>
            <h1>THE <em>LOBBY</em></h1>
            <p>Get everyone in. Pick a mode. Let the chaos begin.</p>
          </div>

          <div className="lobby-layout">
            <div className="panel large">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">ROOM CODE</div>
                  <h2>{room.code}</h2>
                </div>

                <button className="icon-btn" onClick={copyCode}>
                  <Copy size={18} /> Copy invite code
                </button>
              </div>

              <p className="muted">
                Share this four-letter code with your players.
              </p>

              <div className="players-grid">
                {players.map((player) => (
                  <div className="player-card" key={player.id}>
                    <div className="avatar">
                      {player.name?.slice(0, 1).toUpperCase()}
                    </div>

                    <div>
                      <b>{player.name}</b>
                      <small>
                        {player.user_id === room.host_id ? "HOST" : "PLAYER"}
                      </small>
                    </div>

                    {player.user_id === room.host_id && (
                      <Crown className="crown" size={18} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="panel mode-picker">
              <div className="eyebrow">CHOOSE YOUR CHAOS</div>
              <h2>Game mode</h2>

              <div className="mode-list">
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    className={
                      "mode-option " +
                      (room.mode === item.id ? "selected" : "")
                    }
                    disabled={!isHost}
                    onClick={async () => {
                      if (!isHost) return;

                      const { error } = await supabase.rpc(
                        "words_set_mode",
                        {
                          p_code: room.code,
                          p_mode: item.id
                        }
                      );

                      if (error) {
                        notify(error.message);
                      } else {
                        await refresh(room.code);
                      }
                    }}
                  >
                    <span>{item.icon}</span>
                    <div>
                      <b>{item.name}</b>
                      <small>{item.desc}</small>
                    </div>

                    {room.mode === item.id && <Check size={17} />}
                  </button>
                ))}
              </div>

              {isHost ? (
                <button
                  className="btn primary full"
                  onClick={startGame}
                  disabled={players.length < 2 || busy}
                >
                  <Play size={17} /> Start the game
                </button>
              ) : (
                <p className="waiting">
                  Waiting for the host to start…
                </p>
              )}

              <p className="tiny muted">
                {players.length} player{players.length === 1 ? "" : "s"} in
                the room · 2 minimum
              </p>
            </div>
          </div>

          <button className="text-button" onClick={leave}>
            <LogOut size={16} /> Leave room
          </button>
        </section>
      )}

      {screen === "game" && room && round && (
        <section className="content-page game-page">
          <div className="game-meta">
            <span>ROUND {round.number}</span>
            <span>{mode.icon} {mode.name}</span>
            <span>{players.length} PLAYERS</span>
          </div>

          <div className="prompt-card">
            <div className="eyebrow">YOUR CHALLENGE</div>
            <h1>{round.prompt}</h1>
            <p>{mode.desc}</p>
          </div>

          {mode.kind === "draw" ? (
            <div className="panel drawing-panel">
              <div className="draw-tools">
                <label>
                  INK
                  <input
                    type="color"
                    value={canvasColor}
                    onChange={(event) => setCanvasColor(event.target.value)}
                  />
                </label>

                <label>
                  SIZE
                  <input
                    type="range"
                    min="2"
                    max="18"
                    value={canvasWidth}
                    onChange={(event) => setCanvasWidth(+event.target.value)}
                  />
                </label>

                <button className="icon-btn" onClick={clearCanvas}>
                  <Eraser size={16} /> Clear
                </button>
              </div>

              <canvas
                ref={canvas}
                width="900"
                height="520"
                style={{ touchAction: "none", width: "100%" }}
                onPointerDown={beginDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
              />

              <button
                className="btn primary full"
                onClick={submitDrawing}
              >
                <Send size={17} /> Submit drawing
              </button>
            </div>
          ) : (
            <div className="panel answer-panel">
              <label>YOUR ANSWER</label>

              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                maxLength={500}
                placeholder="Make it clever. Make it weird. Make it CHAOS."
              />

              <div className="answer-bottom">
                <small>{answer.length}/500</small>

                <button
                  className="btn primary"
                  onClick={submitAnswer}
                  disabled={!answer.trim()}
                >
                  <Send size={17} /> Submit answer
                </button>
              </div>
            </div>
          )}

          <div className="panel submissions">
            <div className="panel-head">
              <h2>Players in this round</h2>
              <span className="count">
                {roundAnswers.length}/{players.length} submitted
              </span>
            </div>

            <div className="submission-list">
              {players.map((player) => {
                const submitted = roundAnswers.some(
                  (item) => item.user_id === player.user_id
                );

                return (
                  <div className="submission-row" key={player.id}>
                    <span className="avatar small-avatar">
                      {player.name?.[0]?.toUpperCase()}
                    </span>

                    <span>{player.name}</span>

                    <span className={submitted ? "submitted" : "pending"}>
                      {submitted ? "Submitted ✓" : "Thinking…"}
                    </span>
                  </div>
                );
              })}
            </div>

            {isHost && (
              <button
                className="btn secondary full"
                onClick={finishRound}
              >
                End round & reveal answers
              </button>
            )}
          </div>
        </section>
      )}

      {screen === "results" && room && (
        <section className="content-page">
          <div className="page-heading">
            <div className="eyebrow"><span /> THE REVEAL</div>
            <h1>THE <em>CHAOS</em> IS IN.</h1>
            <p>
              Read the answers, vote for your favourites, and crown
              the chaos champion.
            </p>
          </div>

          <div className="results-grid">
            {answers.map((item, index) => {
              const alreadyVoted = votes.length > 0;
              const ownAnswer = item.user_id === userId;
              const count = voteCounts[item.id] || 0;

              return (
                <article className="result-card" key={item.id}>
                  <div className="result-number">
                    ANSWER {String(index + 1).padStart(2, "0")}
                  </div>

                  {item.kind === "drawing" ? (
                    <img
                      className="drawing-result"
                      src={item.content}
                      alt="Player submitted drawing"
                    />
                  ) : (
                    <p>{item.content}</p>
                  )}

                  <small>
                    {players.find(
                      (player) => player.user_id === item.user_id
                    )?.name || "Player"}
                  </small>

                  <button
                    className="vote-button"
                    onClick={() => vote(item.id)}
                    disabled={alreadyVoted || ownAnswer}
                  >
                    {votes.includes(item.id)
                      ? "VOTED ✓"
                      : ownAnswer
                      ? "YOUR ANSWER"
                      : alreadyVoted
                      ? "VOTE ALREADY CAST"
                      : "✦ Give 100 points"}
                  </button>

                  <small className="vote-total">
                    {count} vote{count === 1 ? "" : "s"}
                  </small>
                </article>
              );
            })}
          </div>

          <div className="panel scoreboard">
            <div className="panel-head">
              <h2>Scoreboard</h2>
              <span className="eyebrow">THE CHAOS RANKINGS</span>
            </div>

            {leaderboard.map((player, index) => (
              <div className="score-row" key={player.id}>
                <b>#{index + 1}</b>
                <span className="avatar small-avatar">
                  {player.name?.[0]?.toUpperCase()}
                </span>
                <strong>{player.name}</strong>
                <span>{player.score || 0} pts</span>
              </div>
            ))}
          </div>

          {isHost && (
            <button
              className="btn primary next-btn"
              onClick={nextRound}
            >
              <RotateCcw size={17} /> Next round
            </button>
          )}

          <button className="text-button" onClick={leave}>
            <LogOut size={16} /> Leave room
          </button>
        </section>
      )}

      <footer>
        <span>WORDS OF CHAOS © 2026</span>
        <span>MAKE IT UP. MAKE IT FUN.</span>
      </footer>
    </main>
  );
}
