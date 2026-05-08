# Module 4 — Voice & Intent
**App:** Into Your Stories
**Status:** Design doc — pending approval before execution
**Depends on:** Module 3 (NoteCaptureSheet + noteService), Module 8 (SearchScreen — partial dependency)

---

## Purpose

Activate the mic button stub in NoteCaptureSheet. Users hold the mic to record, iOS transcribes speech on-device, and Claude determines whether the user meant to save a note or trigger a search. The result routes into the existing save or search flow.

After this module: push-to-talk capture works. Voice saves notes. Voice triggers search. Ambiguous input defaults to save with a one-tap escape hatch.

---

## Voice Input: How It Works

**Engine:** iOS Native Speech Recognition via `SFSpeechRecognizer`, accessed through `expo-speech-recognition`. On-device, free, no external API call for transcription. English accuracy is sufficient for V1.

**Interaction model:** Push-to-talk. The user holds the mic button while speaking; releases to stop. No always-on listening. This is a deliberate design decision — battery-friendly, and users have a clear start/stop signal.

**Permissions:** Microphone + speech recognition permissions requested on first mic tap, before recording starts.

**Transcription:** Real-time partial transcripts are shown in the text input as the user speaks — visual feedback that recording is working. Final transcript replaces partials on release.

---

## Intent Detection: Claude's Role

Once transcription completes, the full transcript is sent to Claude via the Claude API with a tightly scoped prompt:

**Input to Claude:** The transcript text only. No note history, no context.

**Output from Claude:** One of three intents:
- `save` — user is describing an experience, place, or memory
- `search` — user is looking for something ("find", "where was", "what was that place")
- `ambiguous` — could be either

**Confidence routing:**
- `save` → populate text input with transcript → user taps Save (or it auto-saves if confidence is high)
- `search` → dismiss capture sheet → navigate to SearchScreen with transcript pre-filled as query → search fires immediately
- `ambiguous` → treat as `save` (transcript populates text input) → show AmbiguityPrompt below the input

**Latency:** Claude API call is fast (single short prompt). Partial transcript is visible immediately during recording. Intent resolution adds ~1s after release. Acceptable.

---

## AmbiguityPrompt

A small inline banner below the text input, shown only when intent is `ambiguous`:

> *"Did you mean to search instead? [Search →]*"

Tapping "Search →" clears the text input, dismisses the sheet, and navigates to SearchScreen with the transcript pre-filled.

Dismisses automatically if the user edits the text input or taps Save. No timeout auto-dismiss — user controls it.

---

## VoiceRecorder Component

Replaces the stub mic button in NoteCaptureSheet. 

**States:**
- Idle: mic icon, amber tint
- Recording: pulsing amber animation, "Release to stop" label
- Processing: spinner, "Detecting intent..." label
- Done: transitions into text input populated with transcript

**Error states:**
- Permission denied: toast "Microphone access required. Enable in Settings."
- STT failure: toast "Couldn't hear that clearly. Try again." — text input stays empty, user can type.
- Claude API failure: transcript populates input as `save` (graceful degradation — never lose the transcription)

---

## Integration Points

**NoteCaptureSheet** (Module 3):
- Replace stub mic button with `VoiceRecorder` component
- `VoiceRecorder` writes transcript into the sheet's text input field
- `intentService` result triggers either save flow or search navigation
- `AmbiguityPrompt` conditionally rendered below text input

**SearchScreen** (Module 8):
- Accepts a `prefillQuery` navigation param
- When navigated to from voice intent, query fires immediately without user needing to tap search

---

## File Structure

```
src/
  services/
    intentService.ts        ← calls Claude API; returns { intent, text }
  components/
    VoiceRecorder.tsx       ← replaces stub; handles record/transcribe/display
    AmbiguityPrompt.tsx     ← inline banner with "Search instead?" CTA
  hooks/
    useVoiceInput.ts        ← orchestrates: permissions → record → transcribe → intent
  navigation/
    types.ts                ← add prefillQuery param to Search route
```

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| STT engine | iOS Native (expo-speech-recognition) | Free, on-device, no external dependency, sufficient accuracy |
| Interaction model | Push-to-talk (hold) | No always-on listening; clear start/stop; battery-friendly |
| Ambiguous intent | Default to save | Saving is always recoverable; missing a search is annoying, missing a memory is worse |
| Claude API failure | Graceful degrade to save | Transcript is never lost even if intent detection fails |
| Auto-save on high confidence | No — user still taps Save | Preserves user control; avoids accidental saves |
| Partial transcripts | Shown in real-time | Visual feedback that recording is working; reduces uncertainty |
