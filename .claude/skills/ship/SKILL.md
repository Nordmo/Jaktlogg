---
name: ship
description: Implementer en godkjent spec, få den reviewet av en uavhengig agent, sjekk eskaleringsreglene mot diffen åpne PR og slå på auto-merge. GitHub merger først når CI er grønn.
argument-hint: docs/specs/<funksjon>.md
disable-model-invocation: true
---
# /ship $ARGUMENTS

Du styrer loopen fra spec til PR. Ruting bestemmes av reglene og tellingen under, aldri av
ditt eget skjønn om noe er "nytt" eller "løsbart". Svar og commit-meldinger på norsk.

**Du merger aldri direkte.** Bare `gh pr merge --auto --squash` er lov (`guard-merge.sh` sperrer
alt annet). Da merger GitHub først når CI er grønn. Endre aldri GitHub-innstillinger.

**Varsling.** Martin får alltid push når `/ship` slutter, uansett grunn. Det er Stop-vakten som sender,
ikke du: `ship-start.sh` merker økten når `/ship` starter, og når du stopper, sender vakten utfallet.
Rett før du avslutter, hver gang, skriver du utfallet med
`scripts/ship-utfall.sh "<tittel>" "<melding>" [lenke] [prioritet]`. Glemmer du det, eller stopper du
for å spørre om noe, får Martin «/ship venter». Revieweren kjører i bakgrunnen, og du må avslutte turen for
å få svaret. Det er greit: så lenge en bakgrunnsjobb du har startet kjører, sender vakten ikke «venter»
(`bakgrunn.js` leser transkriptet). Skriv ikke utfall mens du venter. Tre røde forsøk varsler vakten selv. Venter du på
Martins ja til en tillatelse (for eksempel fra låsen), varsler `ship-venter.sh` ham.
Kall ikke `scripts/ntfy.sh` direkte, og skriv aldri ntfy-emnet noe sted.

## 0. Forutsetninger

Stopp og si fra til Martin (uten branch og uten `ESCALATION.md`) hvis noe av dette ikke stemmer:

- `scripts/ship-klar.sh $ARGUMENTS` gir exit 0. Den sjekker at specen finnes under `docs/specs/`, har
  `Status: godkjent` og tom "Åpne spørsmål", og at ingenting annet enn specen og
  `tests/acceptance/<funksjon>.spec.js` er ucommittet. Det er normalt at Martin har godkjent specen uten å
  committe den: da blir den med i låse-commiten i steg 2. Exit 1: grunnen er linjene skriptet skriver.
- Agenttypen `reviewer` står i lista over agenter du kan kalle i denne økten. Agenter lastes når
  Claude Code starter, og `/clear` laster dem ikke på nytt. Mangler den, er grunnen
  «reviewer-agenten er ikke lastet i denne økten. Start Claude Code på nytt og kjør /ship igjen.»

Stopper du her, skriv utfallet: `scripts/ship-utfall.sh "Jaktlogg: /ship stoppet" "<hva som mangler>" "" 4`.

## 1. Branch

`git fetch origin` og `git switch -c ship/<funksjon> origin/main`, der `<funksjon>` er filnavnet
uten `.md`. Finnes branchen fra før, fortsett på den og les `git log origin/main..HEAD` først.
En ucommittet spec og akseptansetest blir med over til branchen. Commit dem ikke på `main`.

`ship-start.sh` har laget `"$(git rev-parse --git-common-dir)/ship-aktiv"`. Finnes den ikke, skriv
funksjonsnavnet dit selv. Så lenge fila finnes, varsler Stop-vakten Martin hver gang du stopper.

## 2. Lås akseptansetestene (før all kode)

- Finnes ikke `tests/acceptance/<funksjon>.spec.js`, skriv den: minst én Playwright-test per
  kriterium, med nummeret først i navnet (`test('AK1: ...')`). Mønster: `tests/e2e/smoke.spec.js`.
- Låsen spør Martin før fila skrives. Et ja er godkjenningen av testene.
- Kjør `npx playwright test tests/acceptance/<funksjon>.spec.js`. Testene skal feile nå, fordi
  funksjonen ikke finnes. Består en test allerede, tester den ikke kriteriet: skriv den om.
- Commit bare spec og akseptansetest (`git add $ARGUMENTS tests/acceptance/<funksjon>.spec.js`), med meldingen
  `Lås spec og akseptansetester: <funksjon>`. Er specen allerede committet, inneholder commiten bare testen.
  Den teksten er hva eskaleringssjekken ser etter. Ingen annen kode i denne commiten.

Etter dette rører du aldri `docs/specs/` eller `tests/acceptance/`. Er en test feil, er det en
eskalering, ikke noe du fikser.

## 3. Implementer

Følg specen og `CLAUDE.md`. Gjør ikke mer enn specen ber om. Commit underveis.
Kjør `npm run check` til den er grønn, og commit. (Stop-vakten holder deg uansett i loopen.)

## 4. Review (maks tre runder)

Tell rundene selv, fra 1. Kall subagenten `reviewer` (`subagent_type: "reviewer"`) med:
`Spec: <sti til spec>. Base: origin/main.` Gi den ingenting annet: ikke planen din, ikke
resonnementet ditt, ikke tidligere funn.

**Bare den ekte `reviewer` teller.** Bruk aldri en nødløsning: en annen agenttype med kopierte
instruksjoner, din egen review eller noe annet. Svarer kallet `Agent type 'reviewer' not found`,
eller er en runde likevel gjort med en nødløsning, er reviewen ikke godkjent. Stopp for Martin:
push branchen, åpne PR uten auto-merge med «Review: ikke godkjent, revieweren var en nødløsning»
og årsaken øverst i beskrivelsen, skriv utfallet
`"Jaktlogg: PR venter på deg" "<funksjon>: revieweren var en nødløsning (<årsak>)" <PR-lenke> 4`,
og avslutt.

Ruting på svaret:

| Dom | Neste steg |
| --- | --- |
| `pass` uten `high`/`medium`-funn | Steg 5 |
| `fix`, eller `pass` med `high`/`medium` | Fiks funnene, `npm run check`, commit, ny runde |
| `escalate` | Steg 6 (eskaler) |
| Ugyldig JSON | Kall revieweren én gang til. Fortsatt ugyldig: eskaler |
| Runde 3 ender med `fix` | Eskaler. Det blir ingen fjerde runde |

Er du uenig i et funn, fiks det likevel eller eskaler. Du kan ikke overstyre revieweren.
Ta vare på alle `low`-funn til PR-beskrivelsen.

## 5. Eskaleringsreglene mot diffen

Kjør `node scripts/escalation-check.js <spec> origin/main`.

- Exit 0: ingen regel treffer diffen, ingenting er krysset av. Gå til steg 7.
- Exit 1: eskaler (steg 6). Ta med hele JSON-svaret.
- Exit 2: ucommittede endringer eller feil sti. Rett opp og kjør igjen.

Sjekken leser den faktiske diffen, ikke bare "Berører"-listen. `ikkeVarslet` i svaret er regler
diffen treffer som specen ikke krysset av for. Det er de alvorligste: endringen gjør noe specen
ikke sa. Du kan aldri krysse av i specen i etterkant for å få grønt.

## 6. Eskaler til Martin

Skriv `ESCALATION.md` i repo-roten (den er ikke i git):

```markdown
# Eskalering: <funksjon>

**Beslutning du må ta:** <én konkret ja/nei- eller enten/eller-beslutning>

## Hvorfor
<regel som traff / reviewerens begrunnelse / tre runder brukt>. Regler som ikke var
krysset av i specen står først, merket "ikke varslet i spec".

## Hva som er gjort
<branch, commits, runder>

## Reviewerens funn
<siste runde, alle severity>

## Eskaleringssjekk
<JSON fra steg 5, hvis den ble kjørt>
```

Push branchen og åpne en **utkast-PR** (`gh pr create --draft`) med tittel
`Trenger Martin: <funksjon>` og innholdet fra `ESCALATION.md` som beskrivelse.
Skriv utfallet:
`scripts/ship-utfall.sh "Jaktlogg: trenger deg" "<funksjon>: <beslutningen>" <PR-lenke> 4`.
Avslutt med lenken og beslutningen. Ikke gjør flere endringer.

Martins svar oppdaterer specen (det gjør Martin, eller du med Martins ja), og så kjøres `/ship` på nytt.

## 7. PR med auto-merge

Auto-merge slås på når, og bare når, begge disse er sanne:

1. Siste review-runde var den ekte `reviewer`-agenten, med `pass` og ingen `high`/`medium`.
2. `scripts/escalation-check.js` ga exit 0.

Er begge sanne, skal auto-merge på. Du kan ikke la være av egen tvil: er du usikker, eskaler
(steg 6) med årsaken. Er en av dem usann, hører du ikke hjemme i dette steget.

Sjekk så at porten finnes:
`gh api repos/{owner}/{repo} --jq .allow_auto_merge` er `true`, og
`gh api repos/{owner}/{repo}/rules/branches/main` har en regel `required_status_checks` med `check`.
Mangler en av dem, åpne PR uten auto-merge, skriv utfallet
`"Jaktlogg: PR venter på deg" "<tittel>: auto-merge er ikke satt opp" <PR-lenke> 4`, og avslutt.
Ikke prøv å rette innstillingene.

Push branchen og åpne en vanlig PR mot `main`:

- Tittel: kort, på norsk, hva brukeren får.
- Beskrivelse: lenke til specen, hvilke AK som er dekket av hvilke tester, antall review-runder,
  alle `low`-funn som en liste, og "Eskaleringssjekk: ingen treff".

Så: `gh pr merge <nr> --auto --squash --delete-branch`, og vent på CI i forgrunnen med
`scripts/vent.sh 450 gh pr checks <nr> --watch --fail-fast` (Bash-timeout `600000`). Exit 124 betyr at
tiden gikk ut: kjør samme kommando én gang til, til sammen 15 minutter. Bruk aldri `timeout`: den finnes
ikke på macOS. Kjør ikke ventingen i bakgrunnen.

Er PR-en merget, vent på publiseringen: finn kjøringen på `main` for merge-commiten
(`gh pr view <nr> --json mergeCommit -q .mergeCommit.oid`, så
`gh run list --branch main --event push --json databaseId,headSha`) og kjør
`scripts/vent.sh 450 gh run watch <id> --exit-status` på samme måte (maks to ganger, 15 minutter). `deploy`-jobben publiserer bare når `check` er grønn.

| Utfall | Utfall (`scripts/ship-utfall.sh`) |
| --- | --- |
| Merget og publisert | `"Jaktlogg: shippet og publisert" "<tittel>" <PR-lenke>` |
| Merget, publisering feilet | `"Jaktlogg: publisering feilet" "<tittel>" <lenke til kjøringen> 4` |
| Rød CI | `"Jaktlogg: CI rød" "<tittel>: <sjekken som feilet>" <PR-lenke> 4`. Ikke fiks videre. |
| Ingen svar etter 15 min | `"Jaktlogg: CI henger" "<tittel>" <PR-lenke>` |

Skriv utfallet rett før du avslutter. Avslutt med PR-lenken og utfallet.
