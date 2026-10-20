# Spec: <navn på funksjonen>

<!--
Kopier denne fila til docs/specs/<funksjon>.md (små bokstaver, bindestrek).
Claude fyller den ut i plan mode. Martin godkjenner før koding starter.
Slett kommentarene når spec er ferdig.
-->

Status: utkast | godkjent | ferdig
Godkjent av: <navn>, <dato>

## Mål

<!-- Hva skal brukeren kunne gjøre etterpå som ikke går i dag? 1–3 setninger, sett fra brukerens side. -->

## Ikke-mål

<!-- Hva denne endringen bevisst IKKE skal gjøre. Reviewer avviser kode som gjør mer enn spec ber om. -->

- 

## Akseptansekriterier

<!--
Nummererte, testbare påstander på formen "Gitt X, når Y, så Z".
Hvert kriterium får minst én test i tests/acceptance/<funksjon>.spec.js
med kriteriets nummer i testnavnet, f.eks. test('AK1: ...').
Testene skrives før implementasjonen og låses.
-->

1. **AK1:** Gitt <utgangspunkt>, når <handling>, så <synlig resultat>.
2. **AK2:** Gitt …, når …, så ….

## Berører

<!-- Kryss av det som gjelder. Avkrysset betyr at endringen alltid går til Martin, selv om alt er grønt. -->

- [ ] Databaseskjema, ny tabell eller RLS-policy (krever `supabase-oppdatering-N.sql` og README)
- [ ] Innlogging eller tilgang
- [ ] Ny avhengighet (CDN-bibliotek eller npm-pakke)
- [ ] Nøkler eller `CONFIG`
- [ ] Kamera, terreng eller rutetegning (se Fallgruver i CLAUDE.md)
- [ ] `.github/workflows/` eller `.claude/`

## Åpne spørsmål

<!-- Det Claude ikke kan avgjøre selv. Må være tomt før status settes til godkjent. -->

- 

## Notater

<!-- Valgfritt: skisse, lenker, hvilke seksjoner i index.html som trolig endres. -->
