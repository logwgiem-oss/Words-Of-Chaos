import { useEffect, useRef, useState } from "react";
import {
  Users,
  Copy,
  Play,
  Plus,
  LogIn,
  Crown,
  Send,
  ArrowLeft,
  RotateCcw,
  Trophy,
  Palette,
} from "lucide-react";

import {
  GAME_MODES,
  getRandomPrompt,
  createRoomCode,
  shuffleArray,
} from "./game";

import {
  supabase,
  isSupabaseConfigured,
  getGuestSession,
} from "./supabase";

const MAX_PLAYERS = 12;

export default function App() {
  const [screen, setScreen] = useState("home");
  const [playerName, setPlayerName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [selectedMode, setSelectedMode] = useState("fill");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState([]);
  const [scores, setScores] = useState({});
  const [phase, setPhase] = useState("lobby");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [votes, setVotes] = useState({});
  const [hasVoted, setHasVoted] = useState(false);

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const channelRef = useRef(null);

  const isHost = playerId === hostId;
  const currentPlayer = players.find((player) => player.id === playerId);

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => setMessage(""), 3500);
    return () => clearTimeout(timer);
  }, [message]);

  async function enterGame() {
    const name = playerName.trim();

    if (!name) {
      setMessage("Please enter your name first.");
      return;
    }

    if (!isSupabaseConfigured) {
      setMessage("Add your Supabase settings before playing online.");
      return;
    }

    setLoading(true);

    try {
      const session = await getGuestSession();
      setPlayerId(session.user.id);
      return session.user.id;
    } catch (error) {
      setMessage(error.message || "Could not connect to the game.");
      setLoading(false);
      return null;
    }
  }

  async function createRoom() {
    const id = await enterGame();
    if (!id) return;

    try {
      const code = createRoomCode();

      const { error: roomError } = await supabase
        .from("game_rooms")
        .insert({
          code,
          host_id: id,
          mode: selectedMode,
          status: "lobby",
          round_number: 0,
        });

      if (roomError) throw roomError;

      const { error: playerError } = await supabase
        .from("game_players")
        .insert({
          room_code: code,
          player_id: id,
          name: playerName.trim(),
          score: 0,
        });

      if (playerError) throw playerError;

      setRoomCode(code);
      setHostId(id);
      setPlayers([
        {
          id,
          name: playerName.trim(),
          score: 0,
        },
      ]);
      setScores({ [id]: 0 });
      setScreen("lobby");
      setPhase("lobby");
      subscribeToRoom(code);
    } catch (error) {
      setMessage(error.message || "Could not create room.");
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    const id = await enterGame();
    if (!id) return;

    const code = roomCodeInput.trim().toUpperCase();

    if (!code) {
      setMessage("Enter a room code.");
      setLoading(false);
      return;
    }

    try {
      const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("code", code)
        .single();

      if (roomError || !room) {
        throw new Error("That room could not be found.");
      }

      if (room.status !== "lobby") {
        throw new Error("That game has already started.");
      }

      const { data: existingPlayers, error: listError } = await supabase
        .from("game_players")
        .select("*")
        .eq("room_code", code);

      if (listError) throw listError;

      if (existingPlayers.length >= MAX_PLAYERS) {
        throw new Error("That room is full.");
      }

      const { error: joinError } = await supabase
        .from("game_players")
        .insert({
          room_code: code,
          player_id: id,
          name: playerName.trim(),
          score: 0,
        });

      if (joinError) throw joinError;

      setRoomCode(code);
      setHostId(room.host_id);
      setPlayers(
        existingPlayers.map((player) => ({
          id: player.player_id,
          name: player.name,
          score: player.score,
        })).concat({
          id,
          name: playerName.trim(),
          score: 0,
        })
      );

      setScores(
        Object.fromEntries(
          existingPlayers.map((player) => [
            player.player_id,
            player.score,
          ])
        )
      );

      setSelectedMode(room.mode);
      setScreen("lobby");
      setPhase("lobby");
      subscribeToRoom(code);
    } catch (error) {
      setMessage(error.message || "Could not join room.");
    } finally {
      setLoading(false);
    }
  }

  function subscribeToRoom(code) {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`room-${code}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_players",
          filter: `room_code=eq.${code}`,
        },
        () => refreshPlayers(code)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_rooms",
          filter: `code=eq.${code}`,
        },
        (payload) => {
          if (payload.new?.mode) {
            setSelectedMode(payload.new.mode);
          }

          if (payload.new?.status) {
            setPhase(payload.new.status);
          }

          if (payload.new?.round_number !== undefined) {
            setPrompt(payload.new.prompt || "");
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_answers",
          filter: `room_code=eq.${code}`,
        },
        () => refreshAnswers(code)
      )
      .subscribe();

    channelRef.current = channel;

    refreshPlayers(code);
    refreshAnswers(code);
  }

  async function refreshPlayers(code) {
    const { data, error } = await supabase
      .from("game_players")
      .select("*")
      .eq("room_code", code);

    if (error || !data) return;

    setPlayers(
      data.map((player) => ({
        id: player.player_id,
        name: player.name,
        score: player.score,
      }))
    );

    setScores(
      Object.fromEntries(
        data.map((player) => [
          player.player_id,
          player.score,
        ])
      )
    );
  }

  async function refreshAnswers(code) {
    const { data, error } = await supabase
      .from("game_answers")
      .select("*")
      .eq("room_code", code);

    if (error || !data) return;

    setAnswers(
      data.map((item) => ({
        id: item.id,
        playerId: item.player_id,
        text: item.answer,
      }))
    );
  }

  async function startRound() {
    if (!isHost) return;

    if (players.length < 2) {
      setMessage("You need at least two players to start.");
      return;
    }

    const nextPrompt = getRandomPrompt(selectedMode);

    const { error } = await supabase
      .from("game_rooms")
      .update({
        status: "playing",
        round_number: 1,
        prompt: nextPrompt,
      })
      .eq("code", roomCode);

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase
      .from("game_answers")
      .delete()
      .eq("room_code", roomCode);

    setPrompt(nextPrompt);
    setAnswers([]);
    setAnswer("");
    setVotes({});
    setHasVoted(false);
    setPhase("playing");
    setScreen("game");
  }

  async function submitAnswer() {
    if (!answer.trim()) {
      setMessage("Write an answer first.");
      return;
    }

    if (answers.some((item) => item.playerId === playerId)) {
      setMessage("You've already submitted an answer.");
      return;
    }

    const { error } = await supabase
      .from("game_answers")
      .insert({
        room_code: roomCode,
        player_id: playerId,
        answer: answer.trim(),
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setAnswer("");
    setMessage("Answer submitted!");

    await refreshAnswers(roomCode);
  }

  async function revealAnswers() {
    if (!isHost) return;

    const shuffled = shuffleArray(answers);

    setAnswers(shuffled);
    setPhase("reveal");

    await supabase
      .from("game_rooms")
      .update({ status: "reveal" })
      .eq("code", roomCode);
  }

  async function voteForAnswer(answerId) {
    if (hasVoted) {
      setMessage("You've already voted.");
      return;
    }

    const chosen = answers.find((item) => item.id === answerId);

    if (!chosen || chosen.playerId === playerId) {
      setMessage("You cannot vote for your own answer.");
      return;
    }

    const newVotes = {
      ...votes,
      [answerId]: (votes[answerId] || 0) + 1,
    };

    setVotes(newVotes);
    setHasVoted(true);

    setMessage("Vote submitted!");
  }

  async function finishRound() {
    if (!isHost) return;

    const updatedScores = { ...scores };

    for (const [answerId, count] of Object.entries(votes)) {
      const chosen = answers.find((item) => item.id === answerId);

      if (chosen) {
        updatedScores[chosen.playerId] =
          (updatedScores[chosen.playerId] || 0) + count;
      }
    }

    for (const player of players) {
      await supabase
        .from("game_players")
        .update({
          score: updatedScores[player.id] || 0,
        })
        .eq("room_code", roomCode)
        .eq("player_id", player.id);
    }

    setScores(updatedScores);
    setPhase("results");

    await supabase
      .from("game_rooms")
      .update({ status: "results" })
      .eq("code", roomCode);
  }

  async function backToLobby() {
    if (!isHost) return;

    await supabase
      .from("game_rooms")
      .update({ status: "lobby" })
      .eq("code", roomCode);

    setPhase("lobby");
    setScreen("lobby");
  }

  function copyCode() {
    navigator.clipboard?.writeText(roomCode);
    setMessage("Room code copied!");
  }

  function startDrawing(event) {
    if (selectedMode !== "picture" && selectedMode !== "telephone") return;

    drawingRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.moveTo(
      event.clientX - rect.left,
      event.clientY - rect.top
    );
  }

  function draw(event) {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");

    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#29223f";

    ctx.lineTo(
      event.clientX - rect.left,
      event.clientY - rect.top
    );

    ctx.stroke();
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.getContext("2d").clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
  }

  useEffect(() => {
    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  function modeName() {
    return GAME_MODES.find((mode) => mode.id === selectedMode)?.name;
  }

  return (
    <main className="app">
      <header className="topbar">
        <button
          className="logo"
          onClick={() => {
            if (screen === "home") return;
            setScreen("home");
          }}
        >
          <span className="logo-icon">W</span>
          <span>Words of <strong>Chaos</strong></span>
        </button>

        <span className="top-tag">MULTIPLAYER PARTY GAME</span>
      </header>

      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}

      {screen === "home" && (
        <section className="home-screen">
          <div className="hero">
            <div className="eyebrow">🎉 THE PARTY STARTS HERE</div>

            <h1>
              Words of
              <span> Chaos.</span>
            </h1>

            <p>
              Ridiculous prompts. Wild answers.
              Unforgettable rounds.
            </p>
          </div>

          <div className="home-card">
            <label htmlFor="playerName">YOUR PLAYER NAME</label>

            <input
              id="playerName"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="Enter your name..."
              maxLength={20}
            />

            <button
              className="primary-button"
              disabled={loading}
              onClick={createRoom}
            >
              <Plus size={19} />
              {loading ? "Creating..." : "Create a game"}
            </button>

            <div className="divider">
              <span>OR JOIN A GAME</span>
            </div>

            <input
              value={roomCodeInput}
              onChange={(event) =>
                setRoomCodeInput(event.target.value.toUpperCase())
              }
              placeholder="Enter room code..."
              maxLength={5}
            />

            <button
              className="secondary-button"
              disabled={loading}
              onClick={joinRoom}
            >
              <LogIn size={19} />
              Join a game
            </button>

            {!isSupabaseConfigured && (
              <p className="setup-warning">
                Supabase setup is needed before online games can run.
              </p>
            )}
          </div>

          <div className="home-features">
            <div>🎨 Draw</div>
            <div>✏️ Write</div>
            <div>😂 Laugh</div>
            <div>🏆 Score</div>
          </div>
        </section>
      )}

      {screen === "lobby" && (
        <section className="lobby-screen">
          <button
            className="back-button"
            onClick={() => setScreen("home")}
          >
            <ArrowLeft size={17} /> Back
          </button>

          <div className="section-heading">
            <div className="eyebrow">GAME LOBBY</div>
            <h1>Get ready for chaos!</h1>
            <p>Invite everyone using your room code.</p>
          </div>

          <div className="room-code-card">
            <div>
              <span>ROOM CODE</span>
              <strong>{roomCode}</strong>
            </div>

            <button onClick={copyCode}>
              <Copy size={18} />
              Copy
            </button>
          </div>

          <div className="lobby-grid">
            <div className="panel">
              <h2>
                <Users size={20} /> Players ({players.length}/{MAX_PLAYERS})
              </h2>

              <div className="player-list">
                {players.map((player) => (
                  <div className="player-row" key={player.id}>
                    <div className="player-avatar">
                      {player.name.charAt(0).toUpperCase()}
                    </div>

                    <span>{player.name}</span>

                    {player.id === hostId && (
                      <span className="host-label">
                        <Crown size={14} /> HOST
                      </span>
                    )}

                    {player.id === playerId && (
                      <span className="you-label">YOU</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>Choose your game mode</h2>

              <div className="mode-list">
                {GAME_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    className={
                      selectedMode === mode.id
                        ? "mode-option selected"
                        : "mode-option"
                    }
                    disabled={!isHost}
                    onClick={() => setSelectedMode(mode.id)}
                  >
                    <span>{mode.icon}</span>
                    <span>
                      <strong>{mode.name}</strong>
                      <small>{mode.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isHost ? (
            <button
              className="primary-button start-button"
              onClick={startRound}
            >
              <Play size={20} fill="currentColor" />
              Start game
            </button>
          ) : (
            <div className="waiting-message">
              Waiting for the host to start the game...
            </div>
          )}
        </section>
      )}

      {screen === "game" && (
        <section className="game-screen">
          <div className="game-header">
            <div>
              <span className="eyebrow">{modeName()}</span>
              <h1>Round time!</h1>
            </div>

            <div className="round-code">
              ROOM <strong>{roomCode}</strong>
            </div>
          </div>

          <div className="prompt-card">
            <span>YOUR PROMPT</span>
            <h2>{prompt}</h2>
          </div>

          {selectedMode === "picture" ||
          selectedMode === "telephone" ? (
            <div className="drawing-area">
              <div className="drawing-toolbar">
                <span>
                  <Palette size={17} /> Your drawing
                </span>

                <button onClick={clearDrawing}>
                  <RotateCcw size={16} /> Clear
                </button>
              </div>

              <canvas
                ref={canvasRef}
                width={650}
                height={300}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
              />
            </div>
          ) : (
            <div className="answer-area">
              <label htmlFor="answer">YOUR ANSWER</label>

              <textarea
                id="answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Make it funny..."
                maxLength={250}
                rows={4}
              />

              <div className="character-count">
                {answer.length}/250
              </div>

              <button
                className="primary-button"
                onClick={submitAnswer}
              >
                <Send size={18} /> Submit answer
              </button>
            </div>
          )}

          <div className="submission-status">
            <Users size={18} />
            {answers.length} of {players.length} answers submitted
          </div>

          {isHost && (
            <button
              className="secondary-button"
              onClick={revealAnswers}
            >
              Reveal answers
            </button>
          )}
        </section>
      )}

      {screen === "game" && phase === "reveal" && (
        <section className="results-screen">
          <div className="eyebrow">THE ANSWERS ARE IN</div>
          <h1>Let the chaos begin!</h1>

          <div className="answer-cards">
            {answers.map((item, index) => (
              <div className="answer-card" key={item.id}>
                <span>ANSWER {index + 1}</span>
                <p>{item.text}</p>

                <button
                  disabled={hasVoted}
                  onClick={() => voteForAnswer(item.id)}
                >
                  Vote for this answer
                </button>

                <small>{votes[item.id] || 0} votes</small>
              </div>
            ))}
          </div>

          {isHost && (
            <button
              className="primary-button"
              onClick={finishRound}
            >
              Finish round
            </button>
          )}
        </section>
      )}

      {phase === "results" && (
        <section className="results-screen">
          <Trophy size={42} />
          <div className="eyebrow">ROUND COMPLETE</div>
          <h1>The scoreboard</h1>

          <div className="scoreboard">
            {[...players]
              .sort(
                (a, b) =>
                  (scores[b.id] || 0) - (scores[a.id] || 0)
              )
              .map((player, index) => (
                <div className="score-row" key={player.id}>
                  <span>#{index + 1}</span>
                  <strong>{player.name}</strong>
                  <b>{scores[player.id] || 0} pts</b>
                </div>
              ))}
          </div>

          {isHost && (
            <button
              className="primary-button"
              onClick={backToLobby}
            >
              Back to lobby
            </button>
          )}
        </section>
      )}
    </main>
  );
}
