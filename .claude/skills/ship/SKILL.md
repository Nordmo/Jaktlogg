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

**Varsling.** Martin får push med `scripts/ntfy.sh "<tittel>" "<melding>" [lenke] [prioritet]` hver
gang `/ship` er ferdig eller stopper. Skriv aldri ntfy-emnet noe sted.

## 0. Forutsetninger

Stopp og si fra til Martin (uten branch og uten `ESCALATION.md`) hvis noe av dette ikke stemmer:

- `$ARGUMENTS` er en fil under `docs/specs/` som finnes.
- Specen har `Status: godkjent`, og "Åpne spørsmål" er tom.
- Arbeidskopien er ren (`git status --porcelain` er tom).

Stopper du her, varsle: `scripts/ntfy.sh "Jaktlogg: /ship stoppet" "<hva som mangler>"`.

## 1. Branch

`git fetch origin` og `git switch -c ship/<funksjon> origin/main`, der `<funksjon>` er filnavnet
uten `.md`. Finnes branchen fra før, fortsett på den og les `git log origin/main..HEAD` først.

Skriv funksjonsnavnet til `"$(git rev-parse --git-common-dir)/ship-aktiv"`. Så lenge fila finnes,
varsler Stop-vakten Martin hvis du stopper underveis (for eksempel for å spørre om noe).

## 2. Lås akseptansetestene (før all kode)

- Finnes ikke `tests/acceptance/<funksjon>.spec.js`, skriv den: minst én Playwright-test per
  kriterium, med nummeret først i navnet (`test('AK1: ...')`). Mønster: `tests/e2e/smoke.spec.js`.
- Låsen spør Martin før fila skrives. Et ja er godkjenningen av testene.
- Kjør `npx playwright test tests/acceptance/<funksjon>.spec.js`. Testene skal feile nå, fordi
  funksjonen ikke finnes. Består en test allerede, tester den ikke kriteriet: skriv den om.
- Commit bare spec og akseptansetest, med meldingen `Lås spec og akseptansetester: <funksjon>`.
  Den teksten er hva eskaleringssjekken ser etter. Ingen annen kode i denne commiten.

Etter dette rører du aldri `docs/specs/` eller `tests/acceptance/`. Er en test feil, er det en
eskalering, ikke noe du fikser.

## 3. Implementer

Følg specen og `CLAUDE.md`. Gjør ikke mer enn specen ber om. Commit underveis.
Kjør `npm run check` til den er grønn, og commit. (Stop-vakten holder deg uansett i loopen.)

## 4. Review (maks tre runder)

Tell rundene selv, fra 1. Kall subagenten `reviewer` med:
`Spec: <sti til spec>. Base: origin/main.` Gi den ingenting annet: ikke planen din, ikke
resonnementet ditt, ikke tidligere funn.

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
Slett `ship-aktiv`, og varsle:
`scripts/ntfy.sh "Jaktlogg: trenger deg" "<funksjon>: <beslutningen>" <PR-lenke> 4`.
Avslutt med lenken og beslutningen. Ikke gjør flere endringer.

Martins svar oppdaterer specen (det gjør Martin, eller du med Martins ja), og så kjøres `/ship` på nytt.

## 7. PR med auto-merge

Sjekk først at porten finnes:
`gh api repos/{owner}/{repo} --jq .allow_auto_merge` er `true`, og
`gh api repos/{owner}/{repo}/rules/branches/main` har en regel `required_status_checks` med `check`.
Mangler en av dem, åpne PR uten auto-merge, varsle "PR klar, men auto-merge er ikke satt opp",
og avslutt. Ikke prøv å rette innstillingene.

Push branchen og åpne en vanlig PR mot `main`:

- Tittel: kort, på norsk, hva brukeren får.
- Beskrivelse: lenke til specen, hvilke AK som er dekket av hvilke tester, antall review-runder,
  alle `low`-funn som en liste, og "Eskaleringssjekk: ingen treff".

Så: `gh pr merge <nr> --auto --squash --delete-branch`, og vent på CI med
`gh pr checks <nr> --watch --fail-fast` (maks 15 minutter).

| Utfall | Varsel (`scripts/ntfy.sh`) |
| --- | --- |
| Grønn, PR merget | `"Jaktlogg: shippet" "<tittel>" <PR-lenke>` |
| Rød CI | `"Jaktlogg: CI rød" "<tittel>: <sjekken som feilet>" <PR-lenke> 4`. Ikke fiks videre. |
| Ingen svar etter 15 min | `"Jaktlogg: CI henger" "<tittel>" <PR-lenke>` |

Slett `ship-aktiv` før du varsler. Avslutt med PR-lenken og utfallet. Publisering til Pages skjer av
seg selv fra `main` når sjekkene der er grønne.
