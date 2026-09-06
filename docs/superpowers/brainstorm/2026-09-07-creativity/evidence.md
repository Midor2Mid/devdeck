# Evidence — what is actually known about the developer's creative act under agent supervision

**Seat:** evidence. **Date:** 2026-09-07. **Round:** 1 (positions from
`product-director`, `designer` and `product-reviewer` arrive in round 2).

**What this document is.** Findings, with sources, sorted by how much weight they
will bear. It does not argue a product position. Where I am reasoning by analogy
rather than from a finding, it says so in the sentence, not in a footnote.

**Reading key, used throughout and applied without mercy:**

| Mark | Means |
| --- | --- |
| **[R]** | Replicates. Multiple independent studies, or a meta-analysis with a non-trivial N, in the same direction. |
| **[S]** | A single study, or a small literature. Real, but one result. |
| **[F]** | **Folklore.** Widely cited, traceable to no adequate primary source, or traceable to one that says something else. |
| **[A]** | **Analogy.** A finding from another domain that I am transferring on my own judgement. Not evidence about developers. |

**What I read** (opened, not cited from a summary): Bainbridge 1983 in full;
Parasuraman & Manzey 2010 in full; Trafton et al. 2003 in full; Sio & Ormerod 2009
in full; Prechelt 1999 in full; the Microsoft CLI-agent adoption study
(arXiv 2607.01418); the CHI 2026 agent-vs-copilot study (arXiv 2507.08149); METR's
2025 RCT write-up; oberien's citation trace of the 23-minute figure. Everything
else in here is marked by what I actually saw of it.

**The standing caveat on DevDeck.** Nobody outside its author has ever run it
(`PRODUCT.md`, Validation). Every sentence below of the form "DevDeck already does
X" is a claim about the code, verified in the repo. No sentence in here is a claim
about what a user does with it, because there is no such data and there will not
be until step 9.

---

## 1. The famous numbers, and which of them are folklore

This section exists because these numbers get thrown at product decisions, and
three of the four most-thrown are wrong.

### 1.1 "It takes 23 minutes 15 seconds to refocus after an interruption" — **[F]**

**Folklore, in the specific form it is always quoted.** The number is attributed to
Gloria Mark. It is not in the papers it is attributed to. oberien traced the five
papers usually cited and found the figure in none of them
(<https://blog.oberien.de/2023/11/05/23-minutes-15-seconds.html>). Worse for the
usual argument: *The Cost of Interrupted Work: More Speed and Stress* (Mark,
Gudith & Klocke, CHI 2008) — the paper cited most often — reports time spent on the
**original task was lower** with interruptions (20.31 and 20.60 min) than without
(22.77 min), at the price of markedly higher self-reported stress. The paper never
mentions 23. *No Task Left Behind?* (Mark, Gonzalez & Harris, CHI 2005) reports
resumption **probability** across working spheres, not a recovery duration. The
23:15 figure appears to originate in Mark's interviews and press coverage, and
oberien could not find a primary printed source for it.

**What is true and near it.** *Disruption and Recovery of Computing Tasks* (Iqbal
& Horvitz, CHI 2007), per oberien's read, reports **11–16 minutes** to get back to
the original task after resolving an interruption. That is a real number from a
real paper, it is about half the folkloric one, and it measures a different thing
(the whole excursion, not a "refocus cost").

**Product consequence.** Any argument of the form "each interruption costs 23
minutes, therefore batch/suppress notifications" is standing on nothing. The
argument for interruption design has to be made on the resumption-cue evidence in
§3, which is better anyway because it says *what to build* rather than *how bad
things are*.

### 1.2 "The 10x programmer" — **[F]** as a factual claim; **[R]** at a much smaller number

Traceable to Grant & Sackman (1967/68), 12 professional programmers debugging two
programs. Prechelt's technical report *The 28:1 Grant/Sackman legend is
misleading* (Univ. Karlsruhe TR 1999-18,
<https://page.mi.fu-berlin.de/prechelt/Biblio/varianceTR.pdf>) — read in full —
dismantles it:

- The 28:1 ratio "refers to the union of the groups debug Maze **online** and
  debug Maze **offline**", i.e. two different experimental conditions. Separate
  them and "the maximum difference is only **14:1**".
- Three of twelve subjects ignored the recommended high-level language and wrote
  assembly; two of those three were the slowest of all. Drop them and "the maximum
  difference drops to **9.5:1**".
- Max/min is a broken statistic anyway: "If we compare the best to the worst, we
  will obtain almost arbitrarily high ratios if only we have enough subjects at
  hand: somebody will always take still a little longer."
- Prechelt proposes SF25 (median of slowest quarter ÷ median of fastest quarter)
  and SF50 (slower half ÷ faster half), computed over a much larger dataset.
  **SF25's typical range is 2 to 3.** SF50 is "usually less than factor two".
  His summary: "typical work time differences between slower and faster
  programmers are more on the order of **2:1** — much less impressive than the
  oft-cited 28:1."
- And the line that should end the argument: "despite the large interest the 28:1
  figure has created, nobody so far has ever systematically collected a larger
  amount of data about this phenomenon. Everybody still refers to that one single
  case, based on only 12 programmers."

**Product consequence.** A tool cannot be justified by "it makes a 1x into a 10x",
because the 10x is not a measured thing. A 2:1 spread is still worth chasing and
is the honest ceiling.

### 1.3 "Flow requires four uninterrupted hours" — **[F]**

I could not find any primary source for the four-hour figure, and I looked. What
exists nearby:

- Csikszentmihalyi's flow construct specifies challenge/skill balance and clear
  feedback. It specifies **no duration**.
- DeMarco & Lister's *Peopleware* is the usual proximate source, and what it
  actually claims is a **~15-minute** immersion cost, not four hours — and it is a
  trade book reporting consulting-derived numbers, not a controlled study. Note
  the irony that *Peopleware* itself coined "proof by repeated assertion" for
  exactly this failure mode, when DeMarco and Lister went looking for the research
  behind open-plan-office productivity claims and found it did not exist.
- Paul Graham's "Maker's Schedule, Manager's Schedule" is an essay. It is often
  the true source of the half-day figure in people's heads. It cites nothing and
  claims to cite nothing.

**Product consequence.** "Protect four-hour blocks" is a taste position dressed as
a finding. It may still be a good taste position. It is not evidence, and it must
not be used to kill a feature.

### 1.4 "Context switching costs 20–40% of your capacity" — **[F]**

Traced to Weinberg's *Quality Software Management: Systems Thinking* (1992),
where the 20%-per-additional-project loss is presented as a rule of thumb from
consulting observation, not from an experiment. I specifically searched for the
widely-repeated claim that Weinberg later disavowed the numbers and **could not
substantiate it** — so I am not repeating it. The honest statement is narrower and
still damning for anyone citing it: **the number has no controlled-experiment
provenance, and everything downstream of it (the "$588 billion" Basex figure, the
various SaaS "context switching costs you 40%" pages) inherits that.**

### 1.5 The Zeigarnik effect ("unfinished tasks stay in mind") — **[F]** as usually stated

A 2025 meta-analysis in *Humanities and Social Sciences Communications*
(<https://www.nature.com/articles/s41599-025-05000-w>, read via its abstract and
summary, not in full) found **no memory advantage for unfinished tasks**, while
finding that the **tendency to resume** an interrupted task (the Ovsiankina effect)
does hold. The authors conclude the Zeigarnik effect "lacks universal validity".

**Product consequence, and it is a sharp one.** The premise behind every "your
open loops are eating your RAM, so capture them" product is the Zeigarnik effect.
The premise does not replicate. What replicates is that people *return* to
interrupted things — which is an argument for making the return cheap (§3), not
for making the capture ritual elaborate.

### 1.6 "Sleep on it / walk away and the answer comes" — split: **[R]** small, **[F]** large

- **Incubation is real and small.** Sio & Ormerod 2009, *Psychological Bulletin*
  135(1) 94–120 — read in full via <https://gwern.net/doc/psychology/writing/2009-sio.pdf>
  — meta-analysed **117 independent studies, N = 3,606, median study n = 25**. The
  weighted mean effect size was **d = 0.29, 95% CI [0.21, 0.39]**; unweighted
  adjusted mean d = 0.36. A funnel plot and a weighted regression of effect size on
  sample size found **no publication bias** (β = .08, p = .41), so no correction was
  applied. Moderators that mattered: **longer preparation periods produce larger
  incubation effects**; **filling the incubation period with a high-cognitive-demand
  task shrinks the effect**; divergent-thinking tasks benefit more than
  linguistic/visual insight tasks. Notably, for linguistic insight problems a
  **low-demand** task beat **rest**.
- **Unconscious Thought Theory is not real.** The stronger claim — that deliberate
  distraction produces *better* decisions than deliberation — has repeatedly failed
  to replicate. Nieuwenstein et al. 2015 (*Judgment and Decision Making*) built a
  study meeting every condition a prior meta-analysis said maximised the effect,
  and still failed to replicate it; their meta-analysis of multi-attribute choice
  found no unconscious-thought effect.

**Product consequence.** d = 0.29 after a *long* preparation period, degraded by a
*demanding* filler task, is a real but modest thing. If you want to argue that
agent wait time is productive incubation, the evidence says it only works if (a)
the developer did substantial preparatory work on the problem first and (b) the
wait is not filled with something cognitively demanding — **and supervising three
other agents is precisely a cognitively demanding filler**. That is the strongest
evidence-based argument against "let the wait be thinking time" that exists here,
and it cuts against the romantic reading.

### 1.7 What *is* solid about developer work rhythm — **[R]**/**[S]**

- **Developers' work is already extremely fragmented, before agents.** Meyer,
  Barton, Murphy, Zimmermann & Fritz, *The Work Life of Developers* (TSE 2017,
  <https://gwern.net/doc/psychology/writing/2017-meyer.pdf>): observed developers
  switched tasks a mean of **13.3 (±8.5) times per hour**, average **6.2 (±3.3)
  minutes per task**. **[S]**, from computer-usage instrumentation. And the finding
  that should humble everybody in this dispute: **8 of 11 participants rated the
  observed day "fairly or very productive"** anyway. Fragmentation and felt
  productivity are not the same variable.
- **Resumption of programming tasks is genuinely slow and navigation-heavy.**
  Parnin & Rugaber, *Resumption strategies for interrupted programming tasks*
  (Software Quality Journal 19, 5–34, 2011): 10,000 recorded sessions from 86
  programmers plus a 414-programmer survey. **Only 10% of sessions resume
  programming activity in under 1 minute after an interruption**; **only 7% of
  sessions involve no navigation to other locations before editing.** **[S]**, but
  a large-N observational one. (Read via abstract and the authors' reported
  figures, not the full text.)

---

## 2. The shape of supervision work — the richest and most transferable vein

Supervising N semi-autonomous agents is not a novel human activity. It is
**supervisory control**, and it has fifty years of findings. Everything in this
section is **[A]** with respect to *developers* — none of these studies used
programmers or coding agents — but the *mechanisms* (attention allocation,
vigilance, trust calibration, wait-time queueing) are domain-general enough that I
would bet on them transferring, and I say where I would not.

### 2.1 Bainbridge 1983, *Ironies of Automation* — read in full, and it is about DevDeck

Automatica 19(6) 775–779. Four pages. Written about process plants in 1983 and
describing 2026's agent supervision so exactly it is uncomfortable. The passages
that matter:

**The designer leaves the operator the residue.** "the designer who tries to
eliminate the operator still leaves the operator to do the tasks which the designer
cannot think how to automate… it means that the operator can be left with an
arbitrary collection of tasks, and little thought may have been given to providing
support for them." *This is the answer to the round-1 question.* What is left of
the developer's creative act is, structurally, **the residue the agent could not
do** — and Bainbridge's point is that the residue is arbitrary and unsupported by
default, not that it is noble.

**Monitoring cannot be done by humans, full stop.** "We know from many 'vigilance'
studies (Mackworth, 1950) that it is impossible for even a highly motivated human
being to maintain effective visual attention towards a source of information on
which very little happens, for more than about **half an hour**. This means that it
is humanly impossible to carry out the basic function of monitoring for unlikely
abnormalities, which therefore has to be done by an automatic alarm system."

**The log-keeping trap, which is the single sharpest line for product work.** "A
classic method of enforcing operator attention to a steady-state system is to
require him to make a log. Unfortunately **people can write down numbers without
noticing what they are.**" Any DevDeck feature whose theory of value is "it makes
you look at the state" is on notice from this sentence.

**The impossible-task irony.** "if the decisions can be fully specified then a
computer can make them more quickly… There is therefore **no way in which the human
operator can check in real-time that the computer is following its rules
correctly.** One can therefore only expect the operator to monitor the computer's
decisions at some meta-level, to decide whether the computer's decisions are
'acceptable'. If the computer is being used to make the decisions because human
judgement and intuitive reasoning are not adequate in this context, then which of
the decisions is to be accepted? **The human monitor has been given an impossible
task.**"

**Camouflaged failure.** "automatic control can 'camouflage' system failure by
controlling against the variable changes, so that trends do not become apparent
until they are beyond control… **automatic systems should fail obviously.**"
Directly applicable: an agent that retries, works around and self-corrects is
camouflaging. Graceful degradation is named explicitly as a *disadvantage* for
monitorability.

**Legibility over efficiency.** "If the human operator must monitor the details of
computer decision making then, ironically, it is necessary for the computer to make
these decisions **using methods and criteria, and at a rate, which the operator can
follow, even when this may not be the most efficient method technically.**"

**Do not fake failures to keep people alert.** "It would be a mistake, however, to
increase artificially the rate of computer failure as the operator will then not
trust the system." (Kills one obvious "keep the human engaged" design idea before
anybody proposes it.)

**The human must know what the machine is doing.** Citing Enstrom & Rouse: "the
human being must know **which tasks the computer is dealing with and how.**
Otherwise the same problems arise as in human teams in which there is no clear
allocation of responsibility."

**And the sting in the tail.** "the final irony is that it is **the most successful
automated systems, with rare need for manual intervention, which may need the
greatest investment in human operator training.**"

### 2.2 Automation complacency — the numbers, and they are brutal — **[R]**

Parasuraman & Manzey 2010, *Complacency and Bias in Human Use of Automation: An
Attentional Integration*, Human Factors 52(3), read in full. This is a review of a
large literature, and the effects replicate across naive and expert operators.

The load-bearing findings:

- **Complacency is a multitask phenomenon, not a character flaw.** Parasuraman,
  Molloy & Singh 1993: detection of automation failures was **82% under
  variable-reliability** automation vs **33% under constant-reliability** — "a 149%
  difference" — "considering that under single-task conditions, detection of engine
  malfunctions was quite easy, averaging about **97%**." Under single-task backup
  duty, monitoring was "efficient and near perfect in accuracy (~100%)".
- **The mechanism.** "automation complacency represents an **active reallocation of
  attention**" toward the operator's own manual tasks — not a passive drowsiness.
- **Single failure, realistic conditions.** Molloy & Parasuraman 1996: in
  single-task conditions most participants caught the one automation failure; **under
  multitask conditions only about half did**, and fewer still if the failure came
  late in the session. Replicated by Bailey & Scerbo 2007.
- **There is no reliability floor that makes you safe.** May, Molloy &
  Parasuraman 1993 varied reliability across a range: detection of failures varied
  inversely with reliability, "but **no evidence was found for a lower limit of
  automation reliability below which automation complacency did not occur.** Rather,
  detection of automation failures was **still worse than manual performance even at
  a low level of automation reliability.**"
- **Experts are not immune, and practice does not fix it.** Galster & Parasuraman
  2001 found clear complacency in general-aviation pilots with hundreds of hours,
  using a real cockpit system (EICAS). "experience and practice do not appear to
  mitigate automation complacency."
- **Commission errors when the aid is wrong.** Mosier et al. 1992: **75% of pilots
  followed a wrong automated checklist recommendation** to shut down the wrong
  engine, vs **25%** with a paper checklist. In a later study **100%** followed a
  false EICAS alert — and **67% reported in debrief having seen a corroborating
  indication that was not there** ("phantom memory"). Skitka/Mosier's W/PANES
  laboratory study: **41% omission error rate with automation vs ~3% without**
  (97% detection unaided); **~65% commission errors** with a wrong recommendation,
  "although the participants were informed that all readings from indicators and
  gauges were always perfectly valid".
- **First-failure effect: equivocal.** Some support (Rovira et al. 2007), some not
  (Wickens, Gempler & Morphew 2000). In process control (Bahner et al. 2008;
  Manzey et al. 2008/09), **20–50% of participants committed a commission error the
  first time the aid gave a wrong diagnosis**; in one, **18 of 24**. Critically,
  **80%** of those failed because they had not cross-checked — but **20% followed the
  false recommendation despite having sampled every parameter needed to catch it.**
  Verification behaviour is necessary and not sufficient.
- **Learned carelessness.** The model posits a positive feedback loop: because
  automation is usually right, complacent behaviour "rarely leads to obvious
  performance consequences", and the absence of consequences raises complacency
  further over time.

**The one mitigation with actual data behind it is uncomfortable for product
design:** *variable* reliability defeats complacency where constant reliability
produces it, because constant reliability creates "premature cognitive commitment".
You cannot ship variable reliability on purpose (and Bainbridge forbids faking
it). What you *can* ship is the honest version: **do not present the agent as more
uniformly reliable than it is.** Also with support: information-analysis aiding
(show the evidence) mitigates bias better than decision aiding (show the verdict) —
though the review flags this as preliminary.

### 2.3 The reliability crossover — a single transferable number — **[S]**, meta-analytic

Wickens & Dixon 2007, *The benefits of imperfect diagnostic automation: a synthesis
of the literature*, Theoretical Issues in Ergonomics Science 8(3). 20 studies, 35
data points comparing performance under varying automation unreliability against a
non-automated baseline. **Reliability ≈ 0.70 is the "crossover point" below which
unreliable automation is worse than no automation at all**, with benefits a strong
linear function of reliability above it. (Read via the publisher abstract and
SciSpace summary, not the full paper — flagging that.)

This is the cleanest single number in the whole dossier, and it is the one I would
carry into a product argument: **a signal that is right less than ~70% of the time
makes its user worse off than no signal.** DevDeck's own `tileState.ts` has
independently arrived at the same doctrine by scar tissue — its header records that
"This app has repeatedly shipped signals that lied (a terminal title read as a
bell, a one-second pause read as 'finished', a stall check that never fired) and
each cost more trust than the signal was worth. Parsing tool output for test
failures would be the next one, and is cut."

### 2.4 Out-of-the-loop, and why partial automation beats full — **[S]**

Endsley & Kiris 1995, *The Out-of-the-Loop Performance Problem and Level of Control
in Automation*, Human Factors 37(2). Automating a navigation task with an expert
system: low situation awareness corresponded with decision-time decrements after an
expert-system failure, and **the out-of-the-loop problem was significantly greater
under full automation than under intermediate levels of automation**. Keeping the
operator in the active decision loop preserved SA and take-over ability. Attributed
mechanism: the shift from **active to passive information processing**. (Read via
abstract and secondary summaries.)

**Transfer, honestly labelled [A]:** this is the strongest available support for
approve/deny-style interaction over fire-and-forget, and DevDeck already has that
surface. But it is an analogy — navigation with an expert system is not code
review, and nobody has run this experiment with coding agents.

### 2.5 Fan-out — the arithmetic of "how many agents can one person run" — **[S]**

Olsen & Wood, *Fan-out: measuring human control of multiple robots* (CHI 2004);
Crandall & Cummings; Goodrich's neglect-tolerance line. The model:

> **fan-out = (NT + IT) / IT**

where **NT (neglect time)** is how long a unit can be ignored before its performance
drops below a minimum threshold, and **IT (interaction time)** is how long the
operator needs to bring it back up. Fan-out rises with autonomy (longer NT) and with
better interfaces (shorter IT).

**Why this matters to DevDeck more than anything else in this document.** It says
the number of agents one person can supervise is not a property of the agents. It
is a *ratio*, and **half of it is the interface's** — every second shaved off "work
out which one needs me, work out what it is asking, answer it" multiplies directly.
A tool that cannot change agent autonomy can still change fan-out, and this is the
formula that says by how much.

### 2.6 Wait time is the hidden capacity killer — **[S]**, and the single most transferable result

Cummings & Mitchell 2008, *Predicting Controller Capacity in Supervisory Control of
Multiple UAVs*, IEEE Trans. SMC-A 38(2). They modelled the **wait times** created by
human–vehicle interaction and decomposed them into: **interaction wait time (WTI,
including cognitive reorientation)**, **queueing wait time** when several units need
the operator at once, and **situation-awareness wait time (WTSA)** — the time a unit
sits needing attention while the operator does not *know* it needs attention.

The results:

- Including wait times **dropped predicted operator capacity by up to 67%**, with
  **loss of SA the primary source of delay**.
- Even in a **highly automated management-by-exception system** — one designed
  precisely to remove queueing and interaction wait time — **capacity still fell 36%
  versus the no-wait model, purely from SA wait time.**

**This is the result I would put in front of the other three seats.** It says the
dominant cost of supervising N things is **not** the time spent handling them, and
**not** the queue. It is the interval during which something needs you and you have
not noticed. And it says that a good notification/exception system reduces that cost
but does **not** eliminate it — 36% remained in the best case.

**Labelled honestly:** [A] for developers. UAVs are time-critical and physically
consequential; an idle agent session costs tokens and patience, not an airframe. The
*direction* transfers; the magnitude almost certainly does not.

### 2.7 The false alarm, and why one bad signal poisons the set — **[R]**

- **Cry wolf.** Sorkin 1988, *Why are people turning off our alarms?*, JASA 84,
  1107–1108 — the canonical statement. High false-alarm rates cause operators to
  ignore alerts, including true ones, and to delay response to all of them. Wickens
  et al. 2009 tested it specifically in **ATC conflict alerting** and found the
  effect (Human Factors 51(4)). (Read via abstracts and citing literature; the
  Sorkin piece is a two-page letter I did not obtain.)
- **The scale of it in a real deployment.** Joint Commission Sentinel Event Alert
  50 (2013): **"Between 85 and 99 percent of alarm signals do not require clinical
  intervention."** Clinicians respond by turning volume down, turning alarms off, or
  widening limits beyond safe ranges; 98 alarm-related adverse events were reported
  to the Commission's database between January 2009 and June 2012.

**Product consequence.** The cost of a false "NEEDS YOU" is not one wasted glance.
It is a permanent, non-local reduction in the credibility of the whole attention
channel — and the operator's countermeasure (muting) is worse than the original
problem. Combined with Wickens & Dixon's 0.70 crossover: **the attention surface has
a precision budget, it is spent globally, and it does not refill.**

### 2.8 The externalised artefact as shared cognition — **[S]**

Mackay 1999, *Is paper safer? The role of paper flight strips in air traffic
control*, ACM TOCHI 6(4). Four-month study of Paris en-route controllers plus a
comparison of eight control rooms in France and the Netherlands. The finding that
matters: paper flight strips are not a data store — they are a working
representation, and **the marking and spatial arrangement of them is part of how the
controller thinks and how the team stays coordinated**, including signalling
workload to colleagues. Mackay's conclusion is that automating them away failed
because the physical interaction could not be replaced, and proposes keeping the
strips *as* the interface. (Read via abstract and multiple secondary accounts; the
PDF 404'd at both URLs I tried, so I have not read the full text and am not quoting
it.)

**Transfer [A]:** this is the best available evidence that an externalised,
arrangeable, annotatable board of "what is in flight" earns its keep as *thinking
apparatus* rather than as a status display. It is also the strongest argument
available for DevDeck's Mission board as a concept. It is an analogy from a
single-domain ethnography.

### 2.9 Review has a throughput ceiling — **[S]**, and it is grey literature

The Cisco/SmartBear code-review study (2,500 reviews, 3.2M LOC, 50 developers,
2005–06; <https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf>)
is the source of the ubiquitous "**200–400 LOC, under 60 minutes, ~70–90% defect
discovery, defect density drops sharply above ~450 LOC/hour**" numbers.

**Status: [S] with a warning.** This is a vendor-run industrial study, not
peer-reviewed, and the numbers are quoted far beyond what one study supports. But
it is a real measurement with a real N, and it is the only quantitative anchor
anyone has for review throughput. **Treat the shape as informative and the digits as
approximate.** Rigby & Bird's *Convergent contemporary software peer review
practices* (FSE 2013) and Sadowski et al.'s *Modern Code Review: A Case Study at
Google* (ICSE-SEIP 2018) are the peer-reviewed neighbours and broadly agree that
effective reviews are small and short; I did not read them for this document and am
not citing numbers from them.

**Product consequence, and it is the one that should worry everyone.** If the human
role becomes review, and review's effective throughput is a few hundred lines an
hour, then **agent output volume is the binding constraint on the human**, and any
feature that increases agent throughput without changing review ergonomics makes
the human's position worse.

---

## 3. What actually breaks creative work

This is where the evidence is strongest, and the brief's instinct is right: the
literature is much better at destruction than at production.

### 3.1 An interruption without warning is worse than one with — **[S]**, well-designed

Trafton, Altmann, Brock & Mintz 2003, *Preparing to resume an interrupted task*,
IJHCS 58(5) 583–603 — read in full. 17 participants on a resource-allocation "tank
task", interrupted by a secondary tactical-assessment task.

- **Warning condition: an 8-second interruption lag** (a small window flashing for
  600 ms, then the window staying visible, inputs frozen). **Immediate condition:
  zero lag.**
- **Warning participants prepared on 13.5 of 30 opportunities; Immediate
  participants on 3.1 of 30** (χ²(1) = 53.5, p < .001). **95% of Warning-condition
  preparation happened during the 8-second lag.**
- Participants were given **no instruction to prepare** — "it appears that there was
  a natural inclination to use the interruption lag to prepare."
- **What preparation is:** "**62% involved prospective goal encoding**" ("Now what
  was I about to do?") vs 38% retrospective rehearsal ("Now what was I doing?").
  And crucially for interface design: **"79% of preparation utterances referred to
  perceptually available information"**, only 21% to inferred intermediate products.
- Resumption lag exceeded the participant's own baseline inter-click lag
  (F(1,16) = 22.2, p < .001), confirming interruptions were disruptive.
- **The honest limitation, which the authors report themselves:** the Immediate
  group's disruption score **improved across sessions** (F(1,8) = 10.6, p = .01)
  while the Warning group's stayed flat, so the advantage narrowed with practice —
  "people adapt to particularly disruptive forms of interruption."

**Two design conclusions with real support:** (1) **eight seconds of warning is
enough** to change behaviour measurably — the window is small and cheap; (2) **the
thing people reach for during that window is what is already on screen.** An
interface that keeps the relevant state perceptually available is doing 79% of the
preparation work for the user.

### 3.2 Interrupting at a boundary is cheaper than mid-chunk — **[S]**

Adamczyk & Bailey 2004, *If not now, when? The effects of interruption at different
moments within task execution* (CHI 2004): interruptions at **coarse breakpoints
(between chunks)** cost less than at **fine breakpoints (within a chunk)**, and the
moment of interruption changes emotional state and social attribution, not just
time. Mechanism: after a coarse-breakpoint interruption you need only find the next
chunk; after a fine one you must also relocate your position *within* it. (Read via
abstract and the Frontiers 2024 review summarising it, not in full.)

### 3.3 Being unable to reconstruct what you were doing — **[S]**

Parnin & DeLine 2010, *Evaluating cues for resuming interrupted programming tasks*
(CHI 2010, honourable mention): survey of **371 programmers** plus a controlled lab
study of automated resumption cues. Headline from the survey: programmers "**rely
heavily on note-taking across several types of media**" to resume. Combined with
Parnin & Rugaber's 10% / 7% figures (§1.7), the picture is consistent: **resumption
is navigation plus reconstruction, people already build their own scaffolding for
it, and they build it in whatever medium is nearest.** (Read via abstracts and the
Microsoft Research listing; the ACM PDF returned 403.)

### 3.4 Why "capture your ideas" tools get abandoned — **[S]**, and thinner than I wanted

Bernstein, Van Kleek, Karger & schraefel, *Information scraps: how and why
information eludes our personal information management tools*, ACM TOIS 26(4),
2008. 27 knowledge workers at five organisations. I obtained and read the short
companion position paper (<https://hci.stanford.edu/publications/2007/infoscraps/hcir-2007.pdf>)
but **not** the full TOIS article — both PDF URLs I tried for it failed — so I am
reporting less than the literature contains, on purpose.

What the position paper does say, verbatim: scraps "are often recorded
incompletely, written tersely, or intentionally left ambiguous", and "the user may
recall the content via a completely different set of cues than the content itself:
for example, context surrounding note creation ('I wrote it while in the elevator.')
or gestalt meaning ('My notes from that meeting about funding.')."

**What I will and will not claim.** I will claim: **the half-formed idea is
recorded in a form the recording tool cannot parse, and retrieved by cues the tool
does not store.** That is a direct quote-level finding. I will **not** claim the
familiar four-reason list (capture friction, structure imposition, loss of
visibility, mobility) as established, because I did not read the paper that
establishes it. **Anyone in round 2 who wants to argue about capture tools should
read the TOIS paper first; I did not, and I am not going to pretend otherwise.**

### 3.5 Waiting without knowing how long — **[S]**, and check the citation before you use it

Myers 1985, *The importance of percent-done progress indicators for computer-human
interfaces* (CHI '85) is the canonical citation. **I could not obtain the paper** —
the CMU PDF 404'd and Semantic Scholar returned nothing usable — and what circulates
about it online is embellished. Multiple secondary sources agree on **n = 48
students and ~86% preferring the progress bar**; the further claims I saw (that
users without indicators "attempted to restart the computer", that inaccurate
constant-rate bars rate as acceptable) come from blog posts with no visible
provenance and **I am not treating them as findings.**

**Status: the preference result is probably real; treat everything past it as
unverified.** The neighbouring Miller 1968 / Nielsen 0.1s–1s–10s thresholds are in
the same category — universally cited, rarely read, and I did not read them either.

**But there is a hard, modern number for this exact situation** — see §4.1.

### 3.6 What DevDeck's design already touches

Verified in the repo, not asserted:

| Failure mode | What DevDeck already has | Verdict |
| --- | --- | --- |
| **"Which of N needs me"** — Cummings' SA wait time, §2.6 | `tileState.ts` computes one chip per Mission tile, first-match-wins, with `NEEDS YOU` and `ASKING` on the `attention` tone; a flag icon plus count in the status region (`.sb-attn`) | **The single best-supported thing in the product.** It is aimed at the exact cost the supervisory-control literature says dominates. |
| **False alarms poisoning the channel** — §2.7, §2.3 | `tileState.ts`'s header doctrine: every state derived "from something DevDeck knows exactly — a detected prompt, a recorded exit code, a status, a timestamp, a count of paths — and none of them from prose", with test-output parsing explicitly cut | **Correct, and arrived at independently.** Wickens & Dixon's 0.70 crossover is the external justification for a rule the repo already enforces by scar tissue. |
| **Camouflaged failure** — Bainbridge, §2.1 | Three-state `changedCount` (`number` / `null` = asked and failed / `undefined` = not asked yet); `EXITED n` carrying the code; the three-state agent-CLI presence probe | **Directly on target.** "Automatic systems should fail obviously" is precisely the absent/unknown/zero distinction the last two releases were spent building. |
| **Waiting without knowing how long** — §3.5, §4.1 | `relTime` and `isStalled` in `missionTail`; `STALLED` as its own warn-tone state | **Touched.** Elapsed-since-last-output is exactly the disambiguator between "working" and "hung". |
| **Unable to reconstruct what you were doing** — §3.3 | Per-project context switching; labelled, persistent sessions | **Partially.** Persistence preserves the *session*; nothing preserves the *goal*. §3.1 says the thing people reach for is what is perceptually available, and the goal is not. |
| **Interruption without warning** — §3.1 | Nothing. The spawning state gives feedback on *your* action, not warning of an incoming one. | **Untouched, and the cheapest identified gap** — the Trafton window is 8 seconds. |
| **Interrupting mid-chunk** — §3.2 | Nothing. Attention states surface as soon as they are true. | **Untouched.** Also possibly correct to leave untouched: deferring a real `NEEDS YOU` to a boundary trades §3.2's cost against §2.6's, and nothing tells you the exchange rate here. |

**One design constraint the evidence independently endorses.** `DESIGN.md` forbids
a warning colour (the accent is already amber) and requires state to carry a **form
marker** — dot, pill, stripe, dash — as well as a tone. That is not merely a theme
constraint: colour-only coding is the first thing to fail under exactly the
peripheral, low-attention monitoring conditions this whole section is about.

---

## 4. Modern evidence on the actual situation

Three studies from the last eighteen months bear directly on "the agent does the
typing", and they are the only ones here whose subjects are developers.

### 4.1 The wait is real, measured, and it is the human's whole problem — **[S]**

*Code with Me or for Me? How Increasing AI Automation Transforms Developer
Workflows* (arXiv 2507.08149, CHI 2026) — the first controlled study of developers
using coding **agents** rather than copilots. 20 participants, within-subject,
randomised tool order, three realistic task types (GAIA research, matplotlib
feature-adds, SWE-Bench bug fixes), 40 minutes per condition. Copilot vs OpenHands.
Read via the arXiv HTML.

- **Correctness: 60% with the agent vs 25% with the copilot** (+35 points).
- **User effort: 12.5 minutes with the agent vs 25.1 minutes with the copilot.**
- **Total time including agent processing: 27.9 minutes — comparable.**

**Read those three numbers together, because they are the finding.** The agent
halved the human's *active* effort and did not change the *wall-clock* time. The
difference is wait. And what participants did with it: sat there. The paper reports
users "just kind of sitting there" waiting for responses, and flags latency as a
usability friction point.

Also from it, and relevant to §2.1 and §2.2: 55% disagreed that agent outputs were
easier to understand than copilot outputs; generations "seemed kind of hidden";
users asked the agent things like *"Did you delete most of the functions in
[filename]? If so, why?"*; one complained the agent "does not seem to have a good
control on when to stop"; another "did not expect 10 files to be created with more
than 1000 lines each". The paper's Desideratum 1 is **"Agent behaviors should be
transparent."** 75% reported reduced cognitive load.

**Caveat, stated by me not them:** 20 students, none with prior agent experience,
40-minute sessions. This is a first result, not a settled one.

### 4.2 Self-report about AI productivity is unreliable in a measurable direction — **[S]**

METR, *Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer
Productivity* (<https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/>).
16 experienced developers, **246 real issues** in their own large repos (22k+ stars,
~1M LOC), randomly assigned to AI-allowed or AI-disallowed, ~2h per issue.

- **Developers took 19% longer with AI allowed.**
- **They forecast a 24% speedup beforehand, and reported a 20% speedup afterwards.**
- METR are explicit about what they are *not* claiming: not that AI fails to speed
  up most developers, not that it generalises to other domains or experience levels,
  not that future systems won't help. They flag possible learning effects past ~50
  hours of Cursor use and possible sampling bias. **They have since revised the
  experiment design** (<https://metr.org/blog/2026-02-24-uplift-update/>).

**Why this is the most important methodological fact in the dossier.** The gap
between measured and perceived was **~39 percentage points, in the flattering
direction**. DevDeck's only user is its author, and its only evidence is that
author's judgement of his own experience. This study is the specific reason that
combination cannot settle anything — and it converges with Meyer et al.'s finding
(§1.7) that developers rate fragmented days productive. **Round 2 should treat every
"it feels faster / it feels calmer" claim, from any of the four seats, as
uncorroborated.**

### 4.3 Parallel streams are what people report doing — **[S]**, self-report only

*Adoption and Impact of Command-Line AI Coding Agents: A Study of Microsoft's Early
2026 Rollout of Claude Code and GitHub Copilot CLI* (Murphy-Hill, Butler,
Savelieva; arXiv 2607.01418). Read the extracted text.

- Senior engineers were better positioned to exploit agentic tools — "decomposing
  tasks, vetting outputs, and **juggling parallel work**".
- Developers emphasised **parallel streams**: *"I can be working on multiple things
  at once"*.
- The gains "look like more than faster typing" — "developers taking on different
  kinds of work, **running parallel streams of activity**, and becoming more willing
  to attempt complex or previously deferred tasks."
- Context from the same paper: StackOverflow's end-2025 survey of **49,000+
  respondents** found developers' trust in AI **falling**, "developers remain willing
  but reluctant to use AI".

**Status: survey and PR-count evidence, self-reported mechanisms.** It establishes
that DevDeck's premise — one person, several parallel agent streams — describes
something people actually do. It establishes nothing about what interface serves it.

---

## 5. So what is left of the creative act?

Assembling only what is supported:

1. **Deciding what is worth doing, and what "done" means.** Untouched by the
   agent, and unstudied here. No evidence either way; I am not going to dress a
   platitude as a finding.
2. **Noticing that something is wrong.** This is the part with the deepest
   evidence base, and it is bad news: §2.2 says humans are systematically poor at
   it under exactly multitask supervision conditions, and that expertise and
   practice do not fix it. **The creative act includes a task humans are
   measurably bad at, and the interface is the only available lever.**
3. **Judging, at a meta-level, whether an answer is acceptable.** Bainbridge's
   "impossible task", §2.1. Real, and the literature says it is harder than it
   looks, not that it is noble.
4. **Reconstructing your own intent after the wait.** §3.1–3.3. Well-supported,
   and the most directly actionable.
5. **The reformulation that happens while externalising a half-formed thing.**
   §2.8 (Mackay) and §3.4 (Bernstein) both point at it; neither is about
   programmers. **[A]**, and I am not going to strengthen it.

---

## 6. Where the evidence runs out — read this before round 2

Stated plainly, because a bad analogy smuggled in as evidence would poison the
whole dispute:

1. **Nothing in §2 was measured on programmers.** Bainbridge's plants, Parasuraman's
   pilots, Cummings' UAVs, Sorkin's alarms, Endsley's expert system, Olsen's robots
   — every one is **[A]**. I believe the mechanisms transfer, because they are
   mechanisms of attention and trust rather than of aviation. **I cannot prove it,
   and nobody has tried.**
2. **The magnitudes definitely do not transfer.** Cummings' 67% and 36% are about
   systems where the cost of a missed unit is an airframe. An unattended agent
   session costs tokens. Use the direction, never the digits.
3. **"Which of N needs you" has never been studied for coding agents.** This is the
   single most product-relevant gap. DevDeck's `NEEDS YOU`/`ASKING`/`STALLED`
   vocabulary is a reasonable design derived from a plausible analogy. It is not
   validated, and it will not be by any amount of arguing.
4. **What developers do during agent wait time is essentially unmeasured.** §4.1
   observed students "just kind of sitting there" for 40 minutes. Whether an
   experienced developer supervising three sessions incubates, context-switches, or
   degrades is unknown. **§1.6 predicts the incubation reading is wrong** (demanding
   filler tasks shrink the effect), but that is a prediction from an adjacent
   literature, not a measurement.
5. **The "capture tool abandonment" literature I was asked about, I did not
   adequately read.** §3.4. One position paper, not the TOIS article. Treat that
   section as the weakest in the document.
6. **Progress-indicator evidence is thinner than its citation frequency suggests.**
   §3.5. I could not obtain Myers 1985. The modern §4.1 wait finding is what I
   would use instead.
7. **The Cisco/SmartBear review numbers are grey literature.** §2.9. Shape yes,
   digits no.
8. **And the one that governs all of it: DevDeck has no users.** Every "DevDeck
   already touches this" in §3.6 is a claim about code I read. Not one is a claim
   about a person. `ROADMAP.md` step 9 is the only thing that can change that, and
   no argument in round 2 can substitute for it.

---

## Sources

Read in full or substantially:

- Bainbridge, L. (1983). Ironies of Automation. *Automatica* 19(6), 775–779.
  <https://ckrybus.com/static/papers/Bainbridge_1983_Automatica.pdf>
- Parasuraman, R. & Manzey, D. (2010). Complacency and Bias in Human Use of
  Automation: An Attentional Integration. *Human Factors* 52(3), 381–410.
  <https://depositonce.tu-berlin.de/items/> (TU Berlin DepositOnce open copy)
- Trafton, J.G., Altmann, E.M., Brock, D.P. & Mintz, F.E. (2003). Preparing to
  resume an interrupted task. *IJHCS* 58(5), 583–603.
  <https://www.interruptions.net/literature/Trafton-IJHCS03.pdf>
- Sio, U.N. & Ormerod, T.C. (2009). Does incubation enhance problem solving? A
  meta-analytic review. *Psychological Bulletin* 135(1), 94–120.
  <https://gwern.net/doc/psychology/writing/2009-sio.pdf>
- Prechelt, L. (1999). The 28:1 Grant/Sackman legend is misleading. TR 1999-18,
  Univ. Karlsruhe. <https://page.mi.fu-berlin.de/prechelt/Biblio/varianceTR.pdf>
- *Code with Me or for Me?* arXiv 2507.08149. <https://arxiv.org/html/2507.08149v2>
- Murphy-Hill, E., Butler, J. & Savelieva, A. *Adoption and Impact of Command-Line
  AI Coding Agents.* arXiv 2607.01418. <https://arxiv.org/pdf/2607.01418>
- METR (2025). <https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/>
  and the 2026 design revision <https://metr.org/blog/2026-02-24-uplift-update/>
- oberien (2023). Interruptions cost 23 minutes 15 seconds, right?
  <https://blog.oberien.de/2023/11/05/23-minutes-15-seconds.html>
- Bernstein, M. et al. (2007). Personal Information Management, Personal
  Information Retrieval? (position paper only)
  <https://hci.stanford.edu/publications/2007/infoscraps/hcir-2007.pdf>

Read via abstract, publisher page, or secondary summary only — flagged as such
wherever cited:

- Wickens, C.D. & Dixon, S.R. (2007). The benefits of imperfect diagnostic
  automation. *Theoretical Issues in Ergonomics Science* 8(3), 201–212.
  <https://www.tandfonline.com/doi/abs/10.1080/14639220500370105>
- Endsley, M.R. & Kiris, E.O. (1995). The Out-of-the-Loop Performance Problem and
  Level of Control in Automation. *Human Factors* 37(2), 381–394.
  <https://journals.sagepub.com/doi/10.1518/001872095779064555>
- Olsen, D.R. & Wood, S.B. (2004). Fan-out: measuring human control of multiple
  robots. *CHI '04*. <https://dl.acm.org/doi/10.1145/985692.985722>
- Cummings, M.L. & Mitchell, P.J. (2008). Predicting Controller Capacity in
  Supervisory Control of Multiple UAVs. *IEEE Trans. SMC-A* 38(2), 451–460.
  <https://scholars.duke.edu/publication/1108409>
- Sorkin, R.D. (1988). Why are people turning off our alarms? *JASA* 84, 1107–1108.
- Wickens, C.D. et al. (2009). False Alerts in Air Traffic Control Conflict
  Alerting System: Is There a "Cry Wolf" Effect? *Human Factors* 51(4).
  <https://journals.sagepub.com/doi/10.1177/0018720809344720>
- The Joint Commission (2013). Sentinel Event Alert 50: Medical device alarm
  safety in hospitals.
  <https://www.jointcommission.org/en-us/knowledge-library/newsletters/sentinel-event-alert/issue-50>
- Mackay, W.E. (1999). Is paper safer? The role of paper flight strips in air
  traffic control. *ACM TOCHI* 6(4). <https://dl.acm.org/doi/10.1145/331490.331491>
- Adamczyk, P.D. & Bailey, B.P. (2004). If not now, when? *CHI '04*.
  <https://dl.acm.org/doi/10.1145/985692.985727>
- Parnin, C. & DeLine, R. (2010). Evaluating cues for resuming interrupted
  programming tasks. *CHI '10*.
  <https://www.microsoft.com/en-us/research/publication/evaluating-cues-for-resuming-interrupted-programming-tasks/>
- Parnin, C. & Rugaber, S. (2011). Resumption strategies for interrupted
  programming tasks. *Software Quality Journal* 19, 5–34.
  <https://link.springer.com/article/10.1007/s11219-010-9104-9>
- Meyer, A.N., Barton, L.E., Murphy, G.C., Zimmermann, T. & Fritz, T. (2017). The
  Work Life of Developers. *IEEE TSE*.
  <https://gwern.net/doc/psychology/writing/2017-meyer.pdf>
- Nieuwenstein, M.R. et al. (2015). The unconscious thought advantage: Further
  replication failures. *Judgment and Decision Making*.
  <https://www.cambridge.org/core/product/identifier/S1930297500003338/type/JOURNAL_ARTICLE>
- Interruption, recall and resumption: a meta-analysis of the Zeigarnik and
  Ovsiankina effects (2025). *Humanities and Social Sciences Communications*.
  <https://www.nature.com/articles/s41599-025-05000-w>
- Cisco/SmartBear code review case study.
  <https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf>

Sought and **not** obtained (do not cite these through me): Bernstein et al. 2008
TOIS full text; Myers 1985 CHI full text; Mackay 1999 TOCHI full text; Sorkin 1988
full text; See, Howe, Warm & Dember 1995 full text.
