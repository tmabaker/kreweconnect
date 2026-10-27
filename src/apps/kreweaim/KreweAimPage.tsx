import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  makeStyles,
  tokens,
  Title2,
  Title3,
  Text,
  Card,
  Badge,
  Button,
  Radio,
  RadioGroup,
  Textarea,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  Sparkle24Regular,
  Copy24Regular,
  Checkmark24Regular,
  ThumbLike24Regular,
  ThumbDislike24Regular,
} from "@fluentui/react-icons";
import { isDemoMode } from "../../shared/auth/demoMode";
import { Fleur } from "../../shared/components/AimMark";
import {
  fetchMyAim,
  nextLesson,
  startSkillsCheck,
  submitSkillsCheck,
  updateLesson,
  type AimLesson,
  type AimMe,
} from "../../services/kreweaimService";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "900px" },
  muted: { display: "block", color: tokens.colorNeutralForeground3 },
  row: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" },
  status: { display: "flex", alignItems: "flex-start", gap: "16px" },
  mark: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "44px",
    height: "44px",
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  markOff: { backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground3 },
  section: { display: "flex", flexDirection: "column", gap: "12px" },
  question: { display: "flex", flexDirection: "column", gap: "6px" },
  step: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  missing: {
    paddingLeft: "10px",
    borderLeft: `3px solid ${tokens.colorPaletteMarigoldBorderActive}`,
  },
  lessonBody: { display: "flex", flexDirection: "column", gap: "8px", lineHeight: "1.5" },
  tryIt: {
    padding: "12px 16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  prompt: {
    fontFamily: tokens.fontFamilyMonospace,
    whiteSpace: "pre-wrap",
    padding: "8px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  done: { opacity: 0.75 },
});

const RATINGS = ["New to it", "Getting started", "Comfortable", "Power user"];
const LEVELS = ["", "Getting started", "Building", "Confident", "Power user"];

/** Bold (**text**) inside one line, as React nodes: no HTML is injected. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
  );
}

/** The small Markdown subset lessons use: paragraphs, "- " bullets, **bold**. */
function LessonText({ text }: { text: string }) {
  const styles = useStyles();
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={styles.lessonBody}>
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: "20px" }}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <Text key={i}>{inline(lines.join(" ").replace(/^#+\s*/, ""))}</Text>;
      })}
    </div>
  );
}

/** KreweAIM (AI Mastery): the signed-in person's own program, and only theirs. */
export function KreweAimPage() {
  const styles = useStyles();
  const [me, setMe] = useState<AimMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  // Set when "See my results" is pressed with something unanswered, so the gaps are marked.
  const [tried, setTried] = useState(false);
  // Set right after a skills check is submitted, so the results show before the lessons.
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      setMe({ enrolled: false, ready: false, coachReady: false, givenName: null, platforms: [], agent: null, quiz: { status: "not_started" }, skill: {}, lessons: [] });
      return;
    }
    fetchMyAim()
      .then(setMe)
      .catch((err) => setError(err?.message || "Could not load your KreweAIM."));
  }, []);

  /** Runs an action; true when it succeeded, so callers only move on after a real success. */
  const run = async (label: string, action: () => Promise<AimMe>): Promise<boolean> => {
    setBusy(label);
    setError(null);
    try {
      setMe(await action());
      return true;
    } catch (err) {
      setError((err as { message?: string })?.message || "Something went wrong. Try again.");
      // The program may have changed under them (a new tool, a new policy): show its current state.
      fetchMyAim().then(setMe).catch(() => undefined);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const labelFor = (key: string) => me?.platforms.find((p) => p.key === key)?.label ?? key;

  const header = (
    <div>
      <Title2>KreweAIM</Title2>
      <Text size={300} className={styles.muted}>
        AI Mastery. Your own program for getting the most out of the AI tools your company provides.
      </Text>
    </div>
  );

  if (!me) {
    return (
      <div className={styles.page}>
        {header}
        {error ? (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        ) : (
          <Spinner label="Loading your KreweAIM..." />
        )}
      </div>
    );
  }

  const statusCard = (enrolled: boolean, title: string, body: string) => (
    <Card>
      <div className={styles.status}>
        <span className={`${styles.mark} ${enrolled ? "" : styles.markOff}`}>
          <Fleur size={26} />
        </span>
        <div>
          <Text weight="semibold" size={500} style={{ display: "block" }}>
            {title}
          </Text>
          <Text size={300} className={styles.muted}>
            {body}
          </Text>
        </div>
      </div>
    </Card>
  );

  const errorBar = error && (
    <MessageBar intent="error">
      <MessageBarBody>{error}</MessageBarBody>
    </MessageBar>
  );

  if (!me.enrolled) {
    return (
      <div className={styles.page}>
        {header}
        {statusCard(false, "You're not enrolled yet", "KreweAIM is assigned by your IT admin or NOIT Group. Ask them if you would like to join.")}
      </div>
    );
  }
  if (!me.ready) {
    return (
      <div className={styles.page}>
        {header}
        {statusCard(true, "You're enrolled", "Your program is being built from your role and the AI tools you have. Check back soon.")}
      </div>
    );
  }

  const quiz = me.quiz;
  if (quiz.status === "no_tools") {
    return (
      <div className={styles.page}>
        {header}
        {statusCard(true, "You're enrolled", "Your profile does not list any AI tools your company has approved yet. Ask your IT admin or NOIT Group, and your program starts as soon as one is added.")}
      </div>
    );
  }
  const name = me.givenName ? `, ${me.givenName.split(" ")[0]}` : "";
  const toolList = me.platforms.map((p) => p.label).join(", ");

  // ── Right after the check: what they got right, and why ──────────
  if (quiz.status === "done" && showResults) {
    const right = quiz.results.filter((r) => r.picked === r.answer).length;
    return (
      <div className={styles.page}>
        {header}
        <Card>
          <div className={styles.section}>
            <Title3>Your results</Title3>
            <Text>
              {right} of {quiz.results.length} right. Your levels:{" "}
              {Object.entries(me.skill)
                .map(([k, v]) => `${labelFor(k)} ${LEVELS[v]}`)
                .join(", ")}
              . Your lessons start from here.
            </Text>
          </div>
        </Card>
        {quiz.results.map((r) => (
          <Card key={r.id}>
            <div className={styles.question}>
              <div className={styles.row}>
                <Badge appearance="outline">{labelFor(r.platform)}</Badge>
                <Badge appearance="tint" color={r.picked === r.answer ? "success" : "warning"}>
                  {r.picked === r.answer ? "Right" : "Worth a look"}
                </Badge>
              </div>
              <Text weight="semibold">{r.question}</Text>
              {r.picked !== r.answer && r.picked !== null && <Text className={styles.muted}>You picked: {r.choices[r.picked]}</Text>}
              <Text>Best answer: {r.choices[r.answer]}</Text>
              <Text size={200} className={styles.muted}>
                {r.explanation}
              </Text>
            </div>
          </Card>
        ))}
        <div>
          <Button appearance="primary" icon={<Sparkle24Regular />} onClick={() => setShowResults(false)}>
            Continue to my lessons
          </Button>
        </div>
      </div>
    );
  }

  // ── First visit, or new tools since: the skills check ───────────
  if (quiz.status !== "done") {
    const inProgress = quiz.status === "in_progress" ? quiz : null;
    const newTools = quiz.status === "new_tools" ? quiz.platforms.map(labelFor).join(", ") : null;
    // Every comfort rating and every question, in page order, so the first gap is the one to scroll to.
    const items = inProgress
      ? inProgress.platforms.flatMap((p) => [
          { id: `aim-rate-${p}`, platform: p, rating: true, done: ratings[p] !== undefined },
          ...inProgress.questions
            .filter((q) => q.platform === p)
            .map((q) => ({ id: `aim-q-${q.id}`, platform: p, rating: false, done: answers[q.id] !== undefined })),
        ])
      : [];
    const gaps = items.filter((i) => !i.done);
    const complete = !!inProgress && gaps.length === 0;
    const isGap = (id: string) => tried && gaps.some((g) => g.id === id);
    const stillNeeded = (inProgress?.platforms ?? [])
      .map((p) => {
        const parts: string[] = [];
        if (gaps.some((g) => g.platform === p && g.rating)) parts.push("your comfort level");
        const n = gaps.filter((g) => g.platform === p && !g.rating).length;
        if (n) parts.push(`${n} ${n === 1 ? "question" : "questions"}`);
        return parts.length ? `${labelFor(p)}: ${parts.join(" and ")}` : null;
      })
      .filter(Boolean)
      .join("; ");
    return (
      <div className={styles.page}>
        {header}
        {errorBar}
        {!me.coachReady && (
          <MessageBar intent="warning">
            <MessageBarBody>Coaching is not switched on yet. Your skills check will be ready soon.</MessageBarBody>
          </MessageBar>
        )}
        {!inProgress ? (
          <Card>
            <div className={styles.section}>
              <Title3>{newTools ? "You have new AI tools" : `Welcome${name}`}</Title3>
              <Text>
                {newTools
                  ? `You now have ${newTools}. A short check, about a minute, so your lessons on it start at the right level.`
                  : `Your lessons are built for you alone, from your job, the AI tools you have (${toolList}) and what you already know. A quick skills check first, about three minutes, so nothing is too basic or too far ahead.`}
              </Text>
              <div>
                <Button appearance="primary" icon={<Sparkle24Regular />} disabled={!!busy || !me.coachReady} onClick={() => run("quiz", startSkillsCheck)}>
                  {newTools ? "Start the quick check" : "Start my skills check"}
                </Button>
              </div>
              {busy === "quiz" && <Spinner size="small" label="Writing questions for your role..." />}
            </div>
          </Card>
        ) : (
          <>
            <MessageBar intent="info">
              <MessageBarBody>
                Each tool below has two steps. First pick how comfortable you feel with it, then answer its questions.
                Answer both for every tool to see your results.
              </MessageBarBody>
            </MessageBar>
            {inProgress.platforms.map((platform) => (
              <Card key={platform}>
                <div className={styles.section}>
                  <Title3>{labelFor(platform)}</Title3>
                  <div id={`aim-rate-${platform}`} className={`${styles.question} ${isGap(`aim-rate-${platform}`) ? styles.missing : ""}`}>
                    <Text className={styles.step}>Step 1 of 2: your comfort level</Text>
                    <Text weight="semibold">How comfortable are you with {labelFor(platform)} today?</Text>
                    <RadioGroup
                      layout="horizontal"
                      value={ratings[platform] ? String(ratings[platform]) : ""}
                      onChange={(_, d) => setRatings((r) => ({ ...r, [platform]: Number(d.value) }))}
                    >
                      {RATINGS.map((r, i) => (
                        <Radio key={r} value={String(i + 1)} label={r} />
                      ))}
                    </RadioGroup>
                  </div>
                  <Text className={styles.step}>Step 2 of 2: a few quick questions</Text>
                  {inProgress.questions
                    .filter((q) => q.platform === platform)
                    .map((q) => (
                      <div key={q.id} id={`aim-q-${q.id}`} className={`${styles.question} ${isGap(`aim-q-${q.id}`) ? styles.missing : ""}`}>
                        <Text weight="semibold">{q.question}</Text>
                        <RadioGroup
                          value={answers[q.id] !== undefined ? String(answers[q.id]) : ""}
                          onChange={(_, d) => setAnswers((a) => ({ ...a, [q.id]: Number(d.value) }))}
                        >
                          {q.choices.map((c, i) => (
                            <Radio key={i} value={String(i)} label={c} />
                          ))}
                        </RadioGroup>
                      </div>
                    ))}
                </div>
              </Card>
            ))}
            {tried && !complete && (
              <MessageBar intent="warning">
                <MessageBarBody>Almost there. Still needed: {stillNeeded}. The missing items are marked above.</MessageBarBody>
              </MessageBar>
            )}
            <div className={styles.row}>
              <Button
                appearance="primary"
                disabled={!!busy}
                onClick={async () => {
                  if (!complete) {
                    // Show what is left and take the person to it, rather than leaving a gray button.
                    setTried(true);
                    document.getElementById(gaps[0].id)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    return;
                  }
                  if (await run("answers", () => submitSkillsCheck(answers, ratings))) setShowResults(true);
                }}
              >
                See my results
              </Button>
              <Text className={styles.muted}>
                {items.length - gaps.length} of {items.length} answered
              </Text>
              {busy === "answers" && <Spinner size="small" />}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── The program: skill levels and lessons ────────────────────────
  const open = me.lessons.filter((l) => l.status === "new").length;
  return (
    <div className={styles.page}>
      {header}
      {errorBar}
      <Card>
        <div className={styles.section}>
          <Title3>Your AI tools</Title3>
          <div className={styles.row}>
            {me.platforms.map((p) => (
              <Badge key={p.key} appearance="tint" size="large">
                {p.label}
                {me.skill[p.key] ? ` · ${LEVELS[me.skill[p.key]]}` : ""}
              </Badge>
            ))}
          </div>
          {me.agent && (
            <Text size={200} className={styles.muted}>
              Your Krewe agent is {me.agent.agent}, on {me.agent.channel}.
            </Text>
          )}
          <div className={styles.row}>
            <Button appearance="primary" icon={<Sparkle24Regular />} disabled={!!busy || open >= 3 || !me.coachReady} onClick={() => run("lesson", nextLesson)}>
              {me.lessons.length ? "Get my next lesson" : "Get my first lesson"}
            </Button>
            {busy === "lesson" && <Spinner size="small" label="Writing a lesson for you..." />}
            {open >= 3 && !busy && <Text size={200} className={styles.muted}>Finish an open lesson to unlock the next one.</Text>}
          </div>
        </div>
      </Card>

      {me.lessons.map((lesson) => (
        <LessonCard key={lesson.id} lesson={lesson} label={labelFor(lesson.platform)} busy={!!busy} onUpdate={(u) => run(`l:${lesson.id}`, () => updateLesson(lesson.id, u))} />
      ))}
    </div>
  );
}

function LessonCard({
  lesson,
  label,
  busy,
  onUpdate,
}: {
  lesson: AimLesson;
  label: string;
  busy: boolean;
  onUpdate: (u: { status?: "done"; feedback?: "helped" | "not_helpful"; note?: string }) => void;
}) {
  const styles = useStyles();
  const [copied, setCopied] = useState(false);
  const [askNote, setAskNote] = useState(false);
  const [note, setNote] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lesson.tryIt.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the prompt is still on screen to select by hand.
    }
  };
  return (
    <Card className={lesson.status === "done" ? styles.done : undefined}>
      <div className={styles.section}>
        <div className={styles.row}>
          <Badge appearance="outline">{label}</Badge>
          <Text size={200} className={styles.muted}>
            {LEVELS[lesson.level]} · {lesson.minutes} min
          </Text>
          {lesson.status === "done" && <Badge appearance="tint" color="success">Done</Badge>}
        </div>
        <Title3>{lesson.title}</Title3>
        <Text italic>{lesson.why}</Text>
        <LessonText text={lesson.body} />
        <div className={styles.tryIt}>
          <Text weight="semibold">Try it now</Text>
          <Text>{lesson.tryIt.instructions}</Text>
          {lesson.tryIt.prompt && (
            <>
              <div className={styles.prompt}>{lesson.tryIt.prompt}</div>
              <div>
                <Button size="small" icon={copied ? <Checkmark24Regular /> : <Copy24Regular />} onClick={copy}>
                  {copied ? "Copied" : "Copy prompt"}
                </Button>
              </div>
            </>
          )}
        </div>
        <Text weight="semibold">{lesson.takeaway}</Text>
        {lesson.feedback ? (
          <Text size={200} className={styles.muted}>
            {lesson.feedback === "helped" ? "You said this helped." : "You said this did not help. Your next lessons take that into account."}
          </Text>
        ) : (
          <div className={styles.row}>
            {lesson.status === "new" && (
              <Button disabled={busy} icon={<Checkmark24Regular />} onClick={() => onUpdate({ status: "done" })}>
                Mark done
              </Button>
            )}
            <Button disabled={busy} icon={<ThumbLike24Regular />} onClick={() => onUpdate({ feedback: "helped" })}>
              This helped
            </Button>
            <Button disabled={busy} icon={<ThumbDislike24Regular />} onClick={() => setAskNote(true)}>
              Didn't help
            </Button>
          </div>
        )}
        {askNote && !lesson.feedback && (
          <div className={styles.section}>
            <Textarea
              value={note}
              onChange={(_, d) => setNote(d.value)}
              placeholder="What went wrong? For example: the feature wasn't there, the answer was wrong, or it didn't fit my work."
              resize="vertical"
            />
            <div>
              <Button appearance="primary" disabled={busy} onClick={() => onUpdate({ feedback: "not_helpful", note })}>
                Send
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
