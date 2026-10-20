# Agent-loop for Claude Code: implementeringsplan

Oct 19, 2026 · @Martin

Denne fanen er instruksjonene Claude Code følger. Du trenger ikke lese den. Start i Enkel guide.

## Oppsummering og motforestillinger

Hele flyten kan bygges i dag med verktøy Claude Code allerede har: hooks, subagenter, skills og GitHub Actions. Diagrammet kommer fra Boris Tanes artikkel [The Software Development Lifecycle Is Dead](https://boristane.com/blog/the-software-development-lifecycle-is-dead/), der poenget er at menneskelig review bare skal skje ved unntak.

Jeg følger ikke diagrammet slavisk. Seks punkter der jeg mener det bør justeres:

1. **Feil rekkefølge for kostnad.** Lint, typer og tester er raske og gratis. De bør kjøre før agent-review, ellers bruker revieweren tokens på kode som uansett feiler.
2. **Self-verify er det svakeste leddet.** Samme kontekst som skrev koden vurderer den. Den har bare verdi når den sjekker mot noe eksternt: kjørte tester og en spec.
3. **Spec mangler helt.** Tester skrevet av samme agent beviser bare at koden er enig med seg selv. Akseptansekriterier må skrives og godkjennes av deg før koding.
4. **Resolvable vs novel er der det feiler i praksis.** En agent vil kalle nesten alt løsbart og loope. Eskalering må styres av regler og et iterasjonstak, ikke av agentens skjønn.
5. **Agenten kan jukse seg til grønt.** Den raskeste veien forbi en rød test er å svekke testen. Test- og sjekkfiler må beskyttes.
6. **Ship er ikke slutten.** Tane selv sier at overvåking er det egentlige sikkerhetsnettet når mennesket går ut av review. Diagrammet stopper før det.

## Justert flyt

Samme loop som i diagrammet ditt, men med spec først, billige sjekker før review, og et hardt tak på hver sløyfe.

&#91;embedded content: justert agent-loop · 2 porter, 4 veier tilbake\]

Agenten avgjør aldri selv hva som er "novel". Det er telling og faste regler som sender saken til deg.

## Fase 0: Spec og CLAUDE.md

Alt i loopen måles mot en spec du har godkjent. Uten den har reviewer og tester ingenting å sjekke mot.

- **`CLAUDE.md` i repo-roten:** stack, mappestruktur, kodestil, og én kommando som kjører alle sjekker (`npm run check` eller tilsvarende). Kort, maks en skjermside.
- **`docs/specs/<feature>.md` per funksjon:** mål, ikke-mål, og nummererte akseptansekriterier skrevet som testbare påstander ("Gitt X, når Y, så Z").
- **Plan mode først:** Claude lager spec og plan i plan mode. Du godkjenner. Først da starter loopen.
- **Testene for akseptansekriteriene skrives før implementasjonen** og låses (se fase 4). Da kan ikke implementasjonen tilpasse testene til seg selv.

* [ ] Skriv mal for `CLAUDE.md`
* [ ] Skriv mal for `docs/specs/_template.md`

## Fase 1: Automatiske sjekker

Bygg dette først, fordi alle senere faser kaller den samme kommandoen. Én kommando, ett svar: grønt eller rødt med feilmelding.

| Sjekk | TypeScript/web | Python | Fanger |
| --- | --- | --- | --- |
| Format og lint | Biome eller ESLint | Ruff | Stil, døde imports, enkle bugs |
| Typer | `tsc --noEmit` | mypy eller pyright | Feil kontrakter mellom moduler |
| Enhetstester | Vitest | pytest | Logikk mot akseptansekriterier |
| Ende-til-ende | Playwright | (ved behov) | At appen faktisk virker i nettleser |
| Secrets | gitleaks | gitleaks | Nøkler som havner i commits |
| Avhengigheter | `npm audit` | pip-audit | Kjente sårbarheter |
| Bygg | `npm run build` | (pakking) | Det som feiler først i deploy |

- **Lokalt:** `npm run check` (eller `make check`) kjører alt over i rekkefølge, billigst først, og stopper ved første feil.
- **CI:** GitHub Actions kjører nøyaktig samme kommando på hver push. CI er fasiten, lokalt er for fart.
- **Rask feedback under koding:** en `PostToolUse`-hook på `Edit|Write` kjører bare format og lint på filen som ble endret. Hele suiten venter til Stop.

## Fase 2: Selvverifisering med Stop-hook

Selvverifisering gjøres av en hook, ikke av at Claude "lover" å sjekke. `Stop` fyrer når Claude vil avslutte; exit-kode 2 sender feilmeldingen tilbake og tvinger Claude til å fortsette ([hooks-referansen](https://code.claude.com/docs/en/hooks)).

Registrering i `.claude/settings.json` (committes, så den følger repoet):

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/verify-before-stop.sh", "args": [], "timeout": 600 }] }],
    "PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/lint-file.sh", "args": [] }] }]
  }
}
```

Skriptet kjører sjekkene, teller forsøk per sesjon, og gir opp etter tre:

````bash
#!/bin/bash
# .claude/hooks/verify-before-stop.sh
input=$(cat)
session=$(jq -r '.session_id' <<<"$input")
counter="/tmp/claude-verify-$session"

# Ingen endringer i arbeidskopien: ingenting å verifisere
if git diff --quiet HEAD && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

if output=$(npm run check 2>&1); then
  rm -f "$counter"; exit 0          # grønt: Claude får stoppe
fi

n=$(( $(cat "$counter" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$counter"
if [ "$n" -ge 3 ]; then
  rm -f "$counter"
  printf '# Eskalering\n\nSjekker feiler etter 3 forsøk.\n\n```\n%s\n```\n' "$(tail -n 60 <<<"$output")" > ESCALATION.md
  exit 0                            # la Claude stoppe, mennesket tar over
fi

echo "Sjekker feilet (forsøk $n av 3). Fiks dette før du avslutter:" >&2
tail -n 60 <<<"$output" >&2
exit 2                              # blokker stopp, Claude fortsetter
````

- **Hvorfor egen teller og ikke bare `stop_hook_active`:** det flagget skiller bare "første gang" fra "senere". Telleren gir et ekte tak og hindrer evig loop.
- **Windows:** bash-hooks krever Git for Windows. Ellers skriv skriptet i PowerShell og sett `"shell": "powershell"`.
- **Fallgruve:** et skript med feil sti feiler stille som ikke-blokkerende feil. Test hooken med vilje-rød kode første gang.

## Fase 3: Reviewer-subagent

Revieweren får frisk kontekst, bare lesetilgang, og ser kun spec og diff. Den ser aldri implementørens resonnement, og det er hele poenget.

`.claude/agents/reviewer.md`:

```markdown
---
name: reviewer
description: Adversarial review av en diff mot spec. Brukes før merge.
tools: Read, Grep, Glob, Bash
model: sonnet
---
Du er en skeptisk senior-reviewer. Jobben din er å finne grunner til at
denne endringen IKKE bør shippes. Godkjenning gir ingen poeng.

Input: sti til spec og base-branch. Kjør `git diff <base>...HEAD`.

Sjekk i denne rekkefølgen:
1. Har hvert akseptansekriterium i spec en test som faktisk tester det?
2. Er eksisterende tester slettet, svekket eller skippet i diffen?
3. Gjør koden mer eller annet enn spec ber om?
4. Feilhåndtering, kanttilfeller, sikkerhet (input, auth, secrets).
5. Passer endringen arkitekturen beskrevet i CLAUDE.md?

Svar KUN med JSON:
{"verdict": "pass" | "fix" | "escalate",
 "findings": [{"severity": "high|medium|low", "file": "", "line": 0,
               "issue": "", "fix": ""}],
 "escalate_reason": ""}

Bruk "escalate" bare når spec er uklar eller selvmotsigende, eller når
riktig løsning krever en beslutning som ikke står i spec.
```

- **Annen modell enn implementøren:** implementasjonen kjører på Opus som hovedmodell (settes med "model": "opus" i .claude/settings.json), review på Sonnet. Samme modell deler samme blindsoner.
- **Ingen `Edit` eller `Write`:** revieweren skal ikke fikse, bare dokumentere. Fikser gjøres av implementøren i neste runde.
- **Strukturert dom:** JSON gjør at porten i fase 4 kan rute automatisk i stedet for å tolke prosa.
- **Severity-terskel:** bare `high` og `medium` gir `fix`. `low` logges i PR-beskrivelsen og blokkerer ikke.

## Fase 4: Porten "All clear?"

Porten er en skill, `/ship <spec>`, som styrer loopen. Ruting bestemmes av regler og telling, aldri av at agenten selv vurderer om noe er "novel".

**Skillens steg** (`.claude/skills/ship/SKILL.md`):

1. Les spec. Opprett branch eller worktree.
2. Implementer. Stop-hooken (fase 2) holder Claude i loopen til sjekkene er grønne.
3. Kall `reviewer`-subagenten med spec og base-branch.
4. Rut på dommen: `pass` går til ship, `fix` går tilbake til steg 2 med funnene, `escalate` går til menneske.
5. Maks tre review-runder. Fjerde runde betyr eskalering, uansett dom.
6. Før ship: sjekk diffen mot de harde eskaleringsreglene under.

**Harde eskaleringsregler.** Treffer diffen en av disse, går den til deg selv om alt er grønt:

| Treff i diffen | Hvorfor menneske |
| --- | --- |
| `auth/**`, innlogging, tilgangsregler, Supabase RLS-policyer | Feil her er usynlige til de utnyttes |
| `supabase/migrations/**` eller annet databaseskjema | Vanskelig å rulle tilbake når data finnes |
| Ny avhengighet i `package.json` eller `requirements.txt` | Lisens, vedlikehold, forsyningskjede |
| `.env*`, secrets, nøkler | Lekkasje er irreversibel |
| `.github/workflows/**`, `.claude/**` | Agenten endrer reglene den selv dommes etter |
| Slettede eller skippede tester | Klassisk måte å få grønt på |

**Beskytt testene.** En `PreToolUse`-hook på `Edit|Write` returnerer `permissionDecision: "ask"` for `tests/acceptance/**`, `docs/specs/**` og `.claude/**`. Nye tester kan agenten skrive fritt. Akseptansetestene fra fase 0 kan den ikke røre uten at du sier ja.

**Eskaleringspakken.** Når loopen stopper hos deg, skal du få én fil, `ESCALATION.md`: hva som ble forsøkt, reviewerens funn, og én konkret beslutning du må ta. Svaret ditt oppdaterer spec, og loopen starter på nytt. Det er pilen fra Human review tilbake til start.

**Varsling:** en `Notification`- eller `Stop`-hook kan sende push til telefonen (for eksempel via ntfy.sh) når `ESCALATION.md` opprettes.

## Fase 5 og 6: Ship og observasjon

**Ship = PR med auto-merge, ikke commit rett på main.** Tane vil fjerne PR-er helt. For en solo-utvikler koster en PR ingenting når ingen må lese den, og den gir historikk, CI-port og en revert-knapp.

- `/ship` åpner PR med spec-lenke og reviewerens `low`-funn i beskrivelsen, og slår på `gh pr merge --auto --squash`.
- Branch protection på `main`: krever grønn CI. Da kan ikke en lokal feil slå gjennom.
- Deploy skjer automatisk fra `main` (Vercel, Netlify eller GitHub Pages), med preview-deploy per PR.
- Tilbakerulling: `git revert` på merge-commiten. Fungerer fordi skjemaendringer allerede er tvunget gjennom deg.

**Observasjon er det som erstatter menneskelig review.** Uten den vet du ikke at noe gikk galt før en bruker sier ifra.

- Sentry (gratisnivået holder for hobbyprosjekter) for feil i frontend og backend.
- Supabase-logger for databasefeil der det er relevant.
- Valgfritt senere: en planlagt oppgave som ukentlig henter nye Sentry-feil og skriver en spec per feil, klar for `/ship`. Det lukker loopen slik artikkelen beskriver.

## Fase 7: Plugin, rekkefølge og pilot

Når loopen virker i ett repo, pakkes den som en personlig plugin (eget GitHub-repo) og installeres i alle prosjekter. Det prosjektspesifikke, altså sjekk-kommandoen og stacken, ligger i hvert repos `CLAUDE.md` og `package.json`.

```text
ship-loop/
  .claude-plugin/plugin.json
  hooks/hooks.json            Stop, PostToolUse, PreToolUse (beskyttelse)
  scripts/verify-before-stop.sh
  scripts/protect-paths.sh
  agents/reviewer.md
  skills/ship/SKILL.md
  templates/CLAUDE.md
  templates/spec.md
```

**Rekkefølge.** Hver fase er nyttig alene, så bygg i denne rekkefølgen og stopp der gevinsten flater ut:

1. Fase 1 (sjekker og CI). Størst gevinst per time.
2. Fase 0 (spec-mal og `CLAUDE.md`).
3. Fase 2 (Stop-hook). Test den med bevisst rød kode.
4. Fase 3 og 4 (reviewer og `/ship`). Kjør 5 til 10 features og les hver review selv før du stoler på den.
5. Fase 5 (auto-merge og deploy).
6. Fase 6 og 7 (Sentry og plugin).

**Pilot:** Jaktlogg passer godt. Den har GitHub, Supabase og ekte brukere, men lav risiko. Supabase-migreringene tester også eskaleringsregelen i praksis.

**Kostnad:** hver feature kjører implementør pluss opptil tre review-runder. Opus som implementør er den største kostnaden. Treffer du bruksgrensen, bytt hovedmodellen til Sonnet først.

- [ ] Velg pilot-repo
- [x] Fase 1: `npm run check` og GitHub Actions
- [ ] Fase 0: maler for `CLAUDE.md` og spec
- [x] Fase 2: Stop-hook, testet med rød kode
- [ ] Fase 3 og 4: reviewer-agent og `/ship`-skill
- [ ] Fase 5: branch protection og auto-merge
- [ ] Fase 6 og 7: Sentry og plugin-repo
