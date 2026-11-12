# How to use InfoGleam Message Explainer

> For learning and testing only. Explanations may contain mistakes. Check
> against the official HL7 standard and test before using anything in
> production. Do not paste real patient data unless your organization allows
> it.

## Explain a message

1. Put an HL7 v2 message into the text box. You can:
   - paste it,
   - click **Open file** and pick a `.hl7`, `.txt`, `.dat` or `.msg` file, or
   - drag a file and drop it on the text box.
2. Click **Explain**, or press **Ctrl+Enter** (**Cmd+Enter** on a Mac).
   When you paste text that contains `MSH|`, or open a file, the tool
   explains it right away.
3. The tool shows the message type and version, the message view, and each
   segment (for example `MSH`, `PID`, `OBX`) with a list of its fields.

A file is read inside your browser. It is not uploaded anywhere.

No message at hand? Choose one in the sample list under the **Explain**
button. See [Try a sample](#try-a-sample).

On a wide screen, a line under the text box shows the **Ctrl+Enter** key
and the tip that you can drop a file on the box. On a phone this line shows
only the privacy note, and **Explain** is as wide as the screen.

### Message type and version

The bar above the message shows:

- **Message type**: the value of `MSH-9`, for example `ADT^A01^ADT_A01`, with
  a short meaning when the tool knows the code.
- **HL7 version**: the value of `MSH-12`, for example `2.5.1`, with a label:
  - **supported**: versions 2.3 to 2.9. The version notes cover these.
  - **older version**: 2.0, 2.1 and 2.2. The tool can read the message, but
    the version notes start at 2.3, and some fields may not exist in your
    version.
  - **unknown version**: any other value, or an empty `MSH-12`.
- **Explain as version**: the HL7 version the tool uses to explain the
  message (see below).

### Explain as version

HL7 added fields and table codes in later versions, and changed some
rules. The list **Explain as version** next to the version label picks the
version the tool uses:

- **Auto (from MSH-12: 2.3)** uses the version in `MSH-12`. This is the
  default. When `MSH-12` is empty, unknown or older than 2.3 (for example
  2.2), Auto uses v2.9 and the bar shows a note. For a 2.0 to 2.2 message,
  the **Added in v2.x** warnings still compare with its own version.
- **2.3** to **2.9** explain the message as that version, whatever
  `MSH-12` says.

The tool does not store your choice. A new message starts with Auto.

The chosen version decides:

- the **Added in v2.x** warnings for fields,
- the warnings for table codes that are newer than the version, or that
  were removed before it,
- the message checks (see below).

Field names, data types and repeat rules are shown as in HL7 v2.9, for
every version. When the version in use is not 2.9, a short note under the
version label says so. Older versions can differ. Many fields have a
**Version note** that says how. The explanations, tips and version notes
are the same for all versions.

### Message checks

Under the version bar, a summary line says how well the message follows
the HL7 rules of the version used, for example "Checked against HL7 v2.9:
2 differences, 1 note". Click it to open or close the list.

The list is open when there is a problem or a difference, and folded when
there are only notes or nothing. On a phone it always starts folded.

**Three levels.** Each item has one of these levels. Each level has its own
icon, so you do not need to see the colours.

| Level | Meaning | Example |
| --- | --- | --- |
| **Problem** | The tool cannot read the message correctly. | The message does not start with `MSH`. |
| **Differs from HL7** | A rule of the version is broken. | A required field is empty. |
| **Note** | Allowed, or allowed with care, but worth knowing. | A local `Z` segment. |

The checks compare the message with the base HL7 standard only, not with
your partner's interface spec. Many real systems break small rules on
purpose, by agreement. So the list says "differs from HL7", never "wrong".

**What is checked:**

- The message structure: the first segment (`MSH`, or `FHS` or `BHS` for a
  batch file), the encoding characters in `MSH-2` (the number allowed
  changes by version), segment names, segment ends (HL7 uses CR; LF is a
  note), escape sequences such as `\F\` (the codes the version defines),
  and more than one message in the text.
- The version in `MSH-12`: empty, unknown, older than 2.3, or a message
  that uses fields of a later version than it says.
- The fields of `MSH`, `EVN`, `PID`, `PV1`, `NK1`, `ORC`, `OBR`, `OBX`,
  `AL1` and `DG1` in HL7 v2.9: a field after the last one, an empty
  required field, and a field that repeats more times than allowed. A
  field that holds only `""` (delete the value) counts as filled.
- The form of dates, times and numbers in these fields: `DT`, `DTM`, `NM`
  and `SI` (and `TS` and `TM` where a field has them), with the rules of
  the version (for example, from v2.8 a number needs a digit before the
  decimal point).
- Other segments get one note each: a local `Z` segment, or a segment the
  tool does not explain yet (for example `NTE`).

**The checks follow the version.** They use the version in **Explain as
version**. When you pick another version, they run again.

- The field checks need the field rules of the version. The tool has them
  for HL7 v2.9. For another version, the field checks do not run, and the
  summary line and the list say so. The other checks still run, with the
  rules of that version.
- The tool does not know which v2.9 fields are withdrawn (W), not used (X)
  or kept only for backward compatibility (B), so it does not check them.
  The list says so.
- When `MSH-12` is empty, unknown or older than 2.3 and you use Auto, only
  the structure checks run. The field checks wait until you pick v2.9.

**Each item** shows the level, the line, the position, the field name and
one sentence. Click an item to open the explanation of that place. Click
**Why?** to read the rule and where it is in the HL7 standard, for example
"HL7 v2.9, chapter 3, PID attribute table". A few checks are the tool's
own hints, not HL7 rules, and **Why?** says so.

**Marks.** The message view underlines each place with a finding: a double
line for a problem, a wavy line for a difference and a dotted line for a
note, with a small sign after it. Point at the place, or move to it with
the keyboard, to read the sentence. Screen readers read it with the
field. The field list shows a small tag on the field. A field that was
added in a later version keeps its **Added in v2.x** tag.

**Buttons.** Show all items or only one level. **Copy the list** copies the
list as plain text: the version, then one line per item (level, line,
position, field name and sentence).

**The list never holds values from the message.** It shows positions,
rules, versions and counts only. So you can paste the copied list into a
ticket.

**Not checked yet:** codes (table values), segment order and required
segments, parts inside fields, lengths, conditional (C) rules, and local
rules from your partner's interface spec.

### The message view

The message view shows the message exactly as it is, one segment per line.
Segment names are bold and each segment type has its own colour. The
delimiters (`|`, `^`, `~`, `\` and `&`) are shown in a lighter colour.

- Point at any part to see its position and name, for example
  `PID-8 · Administrative Sex` or `PID-5.1 · Family Name`. The name is the
  HL7 v2.9 name.
- Click a field, a component or a sub-component to open its explanation.
- With the keyboard: press **Tab** to go into the view. The arrow keys move
  between fields (left and right) and segments (up and down). **Home** and
  **End** go to the first and last field of a segment. **Enter** or
  **Space** opens the explanation. **Esc** closes it.
- Long lines scroll sideways inside the view.

### The explanation panel

On a wide screen the panel is next to the message. On a phone or a narrow
window it slides up from the bottom; close it with the **×** button or
**Esc**.

The panel shows:

- The position and the name, for example `PID-8 · Administrative Sex`
- How often the field is used in real messages (common, sometimes used,
  rarely used, legacy), whether it repeats, and its data type with a short
  meaning, for example `CWE (coded with exceptions)`
- The value in this message, exactly as it is
- The Mirth path, with a **Copy Mirth path** button
- The explanation of the field (see below)

For a component, the header also says which field it belongs to, for
example `PID-5.1 · Family Name — part of PID-5 Patient Name`. The panel
then shows the component's data type and value, and the explanation of the
field.

### Field explanations

The explanation of a field can show:

- What the field means, in short and in more detail
- The data type and whether the field repeats, for example `CWE · repeats`
- **Added in v2.x**, when the field does not exist in older versions
- A warning when the field is newer than the chosen version (with Auto, the
  version in `MSH-12`)
- **Version note**: how the field differs between versions
- **In real projects**: advice from practice. This is not part of the HL7
  standard.
- An example value
- Common codes from the HL7 table, with the code in this message highlighted

Field names, data types and rules are shown as in HL7 v2.9 (see
**Explain as version**). On the Arabic page the field name stays in Arabic;
the English HL7 v2.9 name is shown as "HL7 name".

### Component names

Components and sub-components have names too, for example `PID-5.1` is
"Family Name" and `PID-3.4.1` is "Namespace ID". The names come from HL7's
data type tables and follow HL7 v2.9. Four data types are not in v2.9
(`CE`, `TS`, `TQ` and `SPS`): their names follow the last version that has
them. The names are in English only, also on the
Arabic page. The tool finds them through the field's HL7 v2.9 data type.
Some data types have no names yet, for example `VID` in `MSH-12` and `MOC`
in `OBR-23`.

### Segments

Each segment block shows the segment name and title, for example
`PID Patient Identification`, and a one-line summary. Click **More** to read
more about the segment. Segments that the tool does not explain yet (for
example `NTE` or Z-segments) show "No explanation yet".

The segment buttons above the list jump to a segment.

### The field list

Each row has:

- **Position**: where the value is in the message. `PID-5` means segment
  `PID`, field 5. `PID-5.1` means component 1 of that field. `PID-3[2].1`
  means the second repetition of `PID-3`, component 1.
- **Name**: the HL7 v2.9 field name, and a label that says how often the
  field is used in real messages. Click the name to open the explanation
  panel.
- **Value**: the text at that position.
- **Mirth path**: the same position written for Mirth Connect or Open
  Integration Engine (OIE) JavaScript, for example
  `msg['PID']['PID.5']['PID.5.1']`. The small copy button at the end of the
  row copies it. On a computer the button shows when you point at the row
  or move to it with the keyboard.

Components and sub-components are folded under their field. Click the
small **3 parts** button to show them. When you click a component in the
message view, its field opens in the list.

On a phone each row is a card: the position, name and label on top, the
value below.

Empty fields are not shown.

### Find a field

Type in **Find a field** to filter the list. You can type:

- a position, for example `PID-3`, `pid 3` or `PID.3` (this also finds its
  components, such as `PID-3.1`),
- a segment, for example `OBX`,
- a name in English (the HL7 v2.9 name) or Arabic, for example
  `Patient Name` or `اسم المريض`.

The tool shows the number of matches. Press **Esc** to clear the search.

### Notes on numbering

- All numbers start at 1, as in the HL7 standard.
- In `MSH`, field 1 is the field separator (`|`) and field 2 is the
  encoding characters (`^~\&`). So the sending application is `MSH-3`.
- In a Mirth path, a second repetition or a second segment uses index `[1]`,
  because Mirth counts these from 0. Example: the second `OBX` segment is
  `msg['OBX'][1]`.

## Try a sample

Under the **Explain** button is the line **No message at hand? Try a
sample:** with a list of samples. The list has two groups: **Patient
admission and registration** and **Lab orders and results**. In each group
the oldest HL7 version comes first. Each name says what the message is in
plain words, then its type and version, for example "Patient admit
(ADT^A01, v2.3)".

Choose a sample, and the tool puts it in the text box and explains it right
away.

The tool never replaces your own message without asking:

| What is in the text box | What happens when you choose a sample |
| --- | --- |
| Nothing, or only spaces | The sample is loaded. |
| A sample that you did not change | The sample is loaded. |
| A sample that you changed or masked | The tool asks first. |
| A message that you pasted or typed | The tool asks first. |
| A message from a file that you opened or dropped | The tool asks first. |

The question says "This replaces the message in the box." Click
**Replace** to load the sample, or **Cancel** (or press **Escape**) to keep
your message.

When you change the text or open a file, the list shows "Choose a sample…"
again.

The samples use made-up data only. They cover HL7 versions 2.2 to 2.9. The
v2.3 sample fills `EVN-7`, a field added in v2.4, on purpose, so you can
see the version warning.

The v2.9 sample (`ADT^A04`, register a patient) has two mistakes on
purpose, so you can see the field checks at work: the birth date in `PID-7`
does not exist (31 February), and the required field `PV1-2` (patient
class) is empty. The message checks list both.

## Mask patient data

The **Mask patient data** and **Copy masked message** buttons are next to
**Explain**. They show when the text box holds a message.

Click **Mask patient data** to replace common patient identifiers with fixed
fake values. Masked fields are highlighted in the message view and in the
list.

The tool masks these fields: `PID-3` (ID number only), `PID-5`, `PID-7`,
`PID-11`, `PID-13`, `PID-14`, `PID-19`, `PID-40` (phone and email, v2.7 and
later), `NK1-2`, `NK1-4`, `NK1-5`.

**Masking is not complete.** Free text such as `OBX-5` and `NTE` is not
masked. Patient data can also be in other segments. Always check the result
yourself.

Click **Copy masked message** to copy the masked message to your clipboard.

## Line endings

The HL7 standard ends each segment with a single carriage return (CR).
Text boxes in web browsers change line endings to line feed (LF). The tool
accepts CR, LF and CRLF. The message checks show LF and CRLF as a note.

## Language

Click **العربية** to switch the page to Arabic (right-to-left). Click
**English** to switch back. The explanations are in both languages. The
message view, positions and Mirth paths stay left-to-right. The Terms,
Privacy and Credits pages are in English only.

## Dark mode

The page follows the light or dark setting of your device.

## The InfoGleam website

The top of the page has two ways to the InfoGleam website
(https://infogleam.com/):

- the InfoGleam symbol, left of the tool's name (right of it in Arabic);
- the **InfoGleam website** link, next to the language button.

Both open the website in a new tab. The tool stays open in its own tab,
with your message still in the box.

The tool's name takes you to the main page of the tool, for example from
the Terms page.

## Credits and source code

The footer links to the Terms, Privacy and Credits pages, and to the source
code. The Credits page lists where the field data and the Arabic font come
from, and their licenses.
