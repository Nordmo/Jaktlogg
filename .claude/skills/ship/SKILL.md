---
name: ship
description: Implementer en godkjent spec, få den reviewet av en uavhengig agent, sjekk eskaleringsreglene mot diffen og åpne PR. Merger aldri selv (før fase 5).
argument-hint: docs/specs/<funksjon>.md
disable-model-invocation: true
---
# /ship $ARGUMENTS

Du styrer loopen fra spec til PR. Ruting bestemmes av reglene og tellingen under, aldri av
ditt eget skjønn om noe er "nytt" eller "løsbart". Svar og commit-meldinger på norsk.

**Du merger aldri.** Fase 5 (auto-merge) er ikke bygget. `/ship` slutter med en PR som Martin
merger selv. `gh pr merge` er sperret i `.claude/settings.json`.

## 0. Forutsetninger

Stopp og si fra til Martin (uten branch og uten `ESCALATION.md`) hvis noe av dette ikke stemmer:

- `$ARGUMENTS` er en fil under `docs/specs/` som finnes.
- Specen har `Status: godkjent`, og "Åpne spørsmål" er tom.
- Arbeidskopien er ren (`git status --porcelain` er tom).

## 1. Branch

`git fetch origin` og `git switch -c ship/<funksjon> origin/main`, der `<funksjon>` er filnavnet
uten `.md`. Finnes branchen fra før, fortsett på den og les `git log origin/main..HEAD` først.

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
Avslutt med lenken og beslutningen. Ikke gjør flere endringer.

Martins svar oppdaterer specen (det gjør Martin, eller du med Martins ja), og så kjøres `/ship` på nytt.

## 7. PR (ingen merge)

Push branchen og åpne en vanlig PR mot `main`:

- Tittel: kort, på norsk, hva brukeren får.
- Beskrivelse: lenke til specen, hvilke AK som er dekket av hvilke tester, antall review-runder,
  alle `low`-funn som en liste, og "Eskaleringssjekk: ingen treff".

Avslutt med PR-lenken og at Martin må merge selv.
