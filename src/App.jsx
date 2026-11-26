import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, getPlayerId } from "./supabase";
import { MODES, randomPrompt } from "./game";
import "./style.css";

const playerId = getPlayerId();

function App() {
  const [name, setName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [votes, setVotes] = useState([]);
  const [answerInput, setAnswerInput] = useState("");
  const [selectedMode, setSelectedMode] = useState("caption");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const me = useMemo(
    () => players.find((player) => player.id === playerId),
    [players]
  );

  const isHost = Boolean(room && room.host_player_id === playerId);
  const myAnswer = answers.find((answer) => answer.player_id === playerId);
  const mode = MODES.find((item) => item.id === room?.mode) || MODES[0];

  const call = async (fn, args) => {
    if (!supabase) throw new Error("Supabase settings are missing.");
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    return data;
  };

  const applyState = useCallback((data) => {
    if (!data) return;
    setRoom(data.room || null);
    setPlayers(data.players || []);
    setAnswers(data.answers || []);
    setVotes(data.votes || []);
  }, []);

  const refresh = useCallback(async () => {
    if (!roomCode) return;
    try {
      const data = await call("wc2_state", {
        p_code: roomCode,
        p_player_id: playerId
      });
      applyState(data);
    } catch (error) {
      setMessage(error.message);
    }
  }, [roomCode, applyState]);

  async function createRoom() {
    if (!name.trim()) {
      setMessage("Enter your player name first.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const data = await call("wc2_create_room", {
        p_player_id: playerId,
        p_name: name.trim(),
        p_mode: selectedMode
      });

      const newCode = data.room.code;
      setRoomCode(newCode);
      applyState(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!name.trim() || !codeInput.trim()) {
      setMessage("Enter your name and room code.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const data = await call("wc2_join_room", {
        p_code: codeInput.trim().toUpperCase(),
        p_player_id: playerId,
        p_name: name.trim()
      });

      setRoomCode(data.room.code);
      applyState(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function startGame() {
    setBusy(true);
    setMessage("");

    try {
      const data = await call("wc2_start_game", {
        p_code: roomCode,
        p_player_id: playerId,
        p_prompt: randomPrompt(room.mode)
      });
      applyState(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer() {
    if (!answerInput.trim()) {
      setMessage("Write your answer first.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const data = await call("wc2_submit_answer", {
        p_code: roomCode,
        p_player_id: playerId,
        p_content: answerInput.trim()
      });
      setAnswerInput("");
      applyState(data);
      setMessage("Answer submitted!");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function revealAnswers() {
    setBusy(true);
    try {
      const data = await call("wc2_reveal", {
        p_code: roomCode,
        p_player_id: playerId
      });
      applyState(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function vote(answerId) {
    setBusy(true);
    try {
      const data = await call("wc2_vote", {
        p_code: roomCode,
        p_player_id: playerId,
        p_answer_id: answerId
      });
      applyState(data);
      setMessage("Vote submitted.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function nextRound() {
    setBusy(true);
    try {
      const data = await call("wc2_next_round", {
        p_code: roomCode,
        p_player_id: playerId,
        p_prompt: randomPrompt(room.mode)
      });
      setAnswerInput("");
      applyState(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function leaveRoom() {
    try {
      await call("wc2_leave_room", {
        p_code: roomCode,
        p_player_id: playerId
      });
    } catch (error) {
      setMessage(error.message);
    }

    setRoomCode("");
    setRoom(null);
    setPlayers([]);
    setAnswers([]);
    setVotes([]);
    setAnswerInput("");
  }

  useEffect(() => {
    if (!roomCode) return undefined;

    refresh();
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [roomCode, refresh]);

  if (!room) {
    return (
      <main className="page">
        <section className="shell">
          <header className="brand">
            <div className="brand-mark">W</div>
            <div>
              <h1>Words of Chaos</h1>
              <p>One room. Terrible answers. Excellent chaos.</p>
            </div>
          </header>

          <section className="panel">
            <h2>Choose your player name</h2>
            <input
              value={name}
              maxLength={18}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />

            <h3>Choose a game mode</h3>
            <div className="mode-grid">
              {MODES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`mode-card ${selectedMode === item.id ? "selected" : ""}`}
                  onClick={() => setSelectedMode(item.id)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>

            <button className="primary" onClick={createRoom} disabled={busy}>
              {busy ? "Creating..." : "Create a room"}
            </button>

            <div className="divider"><span>OR JOIN A ROOM</span></div>

            <input
              value={codeInput}
              maxLength={4}
              onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
              placeholder="4-letter room code"
            />
            <button className="secondary" onClick={joinRoom} disabled={busy}>
              {busy ? "Joining..." : "Join room"}
            </button>
            {message && <p className="notice">{message}</p>}
          </section>
        </section>
      </main>
    );
  }

  const answeredCount = answers.length;
  const alreadyVoted = votes.some((vote) => vote.voter_player_id === playerId);

  return (
    <main className="page">
      <section className="shell">
        <header className="room-header">
          <div>
            <p className="eyebrow">ROOM CODE</p>
            <h1>{room.code}</h1>
            <p>{mode.name} · Round {room.round_number}</p>
          </div>
          <button className="small-button" onClick={leaveRoom}>Leave room</button>
        </header>

        <section className="panel">
          <div className="section-heading">
            <h2>Players</h2>
            <span className="count">{players.length}/12</span>
          </div>

          <div className="player-list">
            {players.map((player) => (
              <div className="player-row" key={player.id}>
                <span className="player-avatar">
                  {player.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="player-name">
                  {player.name}
                  {player.id === playerId ? " (You)" : ""}
                </span>
                {player.id === room.host_player_id && (
                  <span className="host-tag">HOST</span>
                )}
                <span className="player-score">{player.score} pts</span>
              </div>
            ))}
          </div>
        </section>

        {room.status === "lobby" && (
          <section className="panel">
            <h2>Waiting for the chaos</h2>
            <p>Share the room code with your friends. The host can start when everyone has joined.</p>
            {isHost ? (
              <button className="primary" onClick={startGame} disabled={busy || players.length < 2}>
                Start game
              </button>
            ) : (
              <p className="waiting">Waiting for the host to start...</p>
            )}
            {players.length < 2 && <p className="muted">At least two players are needed.</p>}
          </section>
        )}

        {room.status === "playing" && (
          <section className="panel">
            <p className="eyebrow">{mode.name.toUpperCase()}</p>
            <h2>{room.prompt}</h2>
            <p className="muted">
              {answeredCount} of {players.length} players have submitted.
            </p>

            {myAnswer ? (
              <div className="submitted">
                <strong>Your answer is in!</strong>
                <p>Waiting for the other players...</p>
              </div>
            ) : (
              <>
                <textarea
                  value={answerInput}
                  maxLength={2000}
                  onChange={(event) => setAnswerInput(event.target.value)}
                  placeholder="Type your answer..."
                  rows={5}
                />
                <button className="primary" onClick={submitAnswer} disabled={busy}>
                  Submit answer
                </button>
              </>
            )}

            {isHost && (
              <button
                className="secondary"
                onClick={revealAnswers}
                disabled={busy || answeredCount === 0}
              >
                Reveal answers
              </button>
            )}
            {message && <p className="notice">{message}</p>}
          </section>
        )}

        {room.status === "results" && (
          <section className="panel">
            <p className="eyebrow">THE RESULTS</p>
            <h2>Vote for your favourite answer</h2>

            <div className="answer-list">
              {answers.map((answer) => (
                <article className="answer-card" key={answer.id}>
                  <p>{answer.content}</p>
                  <div className="answer-footer">
                    <span>By {answer.player_name}</span>
                    {answer.player_id !== playerId && !alreadyVoted && (
                      <button
                        className="vote-button"
                        onClick={() => vote(answer.id)}
                        disabled={busy}
                      >
                        Vote
                      </button>
                    )}
                    {answer.player_id === playerId && <span>Your answer</span>}
                  </div>
                </article>
              ))}
            </div>

            {alreadyVoted && <p className="submitted">Your vote has been recorded.</p>}

            {isHost && (
              <button className="primary" onClick={nextRound} disabled={busy}>
                Next round
              </button>
            )}
            {message && <p className="notice">{message}</p>}
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
