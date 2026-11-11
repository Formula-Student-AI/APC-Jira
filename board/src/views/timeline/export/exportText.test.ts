import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '../../../types'
import {
  altText,
  cleanText,
  exportFileName,
  fitLine,
  formatAsOf,
  formatDayShort,
  formatMonthRange,
  formatRange,
  formatStamp,
  isolate,
  isolateOwner,
  listText,
  ownerText,
  splitGraphemes,
  statusSentence,
  subtitleText,
  wrapLines,
} from './exportText'
import { splitCodePoints } from './exportTextCore'
import type { Period, Plan, PlanGroup, PlanKeyDate, PlanPhase } from './planTypes'
import type { FontSpec, Measure } from './scene'

// The spec's fake measure: every code point is as wide as 0.55 of the font size (0.6 in mono).
const measure: Measure = (text, font) => [...text].length * font.size * (font.family === 'mono' ? 0.6 : 0.55)
// At 10 pt each code point is 5.5 pt, or 5.665 pt with the 3% slack.
const F10: FontSpec = { family: 'sans', size: 10, weight: 400 }
const fitsIn = (line: string, width: number) => measure(line, F10) * 1.03 <= width + 1e-9

// Special characters are built from code points so none hides in the source.
const cp = (...codes: number[]) => String.fromCodePoint(...codes)
const ZWJ = cp(0x200d)
const FAMILY = [0x1f468, 0x1f469, 0x1f467, 0x1f466].map((code) => cp(code)).join(ZWJ)
const MECHANIC = `${cp(0x1f469)}${ZWJ}${cp(0x1f527)}`
const THUMB_TONED = cp(0x1f44d, 0x1f3fd)
const FLAG_GB = cp(0x1f1ec, 0x1f1e7)
const FLAG_FR = cp(0x1f1eb, 0x1f1f7)
const FLAG_SCOTLAND = cp(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f)
const KEYCAP_ONE = `1${cp(0xfe0f, 0x20e3)}`
const ACUTE = cp(0x301)

const graphemeParts = new Intl.Segmenter('en', { granularity: 'grapheme' })
const wordParts = new Intl.Segmenter('en', { granularity: 'word' })

/** Every index between two of the parts `segmenter` finds in `text`. */
function boundaries(text: string, segmenter: Intl.Segmenter): Set<number> {
  return new Set([0, ...Array.from(segmenter.segment(text), (part) => part.index + part.segment.length)])
}

/** Each line, less a final '…', is the next stretch of `text`, starting and ending where `segmenter` allows. */
function expectStretches(text: string, lines: string[], segmenter = graphemeParts) {
  const allowed = boundaries(text, segmenter)
  let from = 0
  for (const line of lines) {
    const body = line.endsWith('…') ? line.slice(0, -1) : line
    if (body === '') continue
    const at = text.indexOf(body, from)
    expect(at, `“${body}” is the next part of “${text}”`).toBeGreaterThanOrEqual(0)
    expect(allowed.has(at) && allowed.has(at + body.length), `“${body}” starts and ends between parts`).toBe(true)
    from = at + body.length
  }
}

describe('cleanText', () => {
  it('makes every run of whitespace one space and trims the ends', () => {
    expect(cleanText(`  Chassis${cp(9, 9)}design ${cp(10)} review${cp(13, 10)}  `)).toBe('Chassis design review')
    expect(cleanText(`Wing${cp(0xa0, 0x3000)}nose${cp(0x2028)}cone${cp(0x85)}tip`)).toBe('Wing nose cone tip')
  })

  it('removes control characters without leaving a double space', () => {
    expect(cleanText(`Brake${cp(0)}s${cp(7)} and ${cp(0x1b)} pedals${cp(0x7f, 0x9f)}`)).toBe('Brakes and pedals')
  })

  it('removes bidi embedding, override and isolate characters and the byte-order mark', () => {
    expect(cleanText(`${cp(0x202e)}fdp.exe${cp(0x202c)} plan`)).toBe('fdp.exe plan')
    expect(cleanText(`${cp(0x202a)}a${cp(0x202b)}b${cp(0x202d)}c`)).toBe('abc')
    expect(cleanText(`${cp(0x2066)}x${cp(0x2069)}${cp(0x2067)}y${cp(0x2068)}`)).toBe('xy')
    expect(cleanText(`${cp(0xfeff)}Title`)).toBe('Title')
  })

  it('keeps marks that only nudge direction, and everything that joins emoji', () => {
    expect(cleanText(`a${cp(0x200e)}b${cp(0x200f)}`)).toBe(`a${cp(0x200e)}b${cp(0x200f)}`)
    expect(cleanText(`${FAMILY} ${FLAG_SCOTLAND} ${KEYCAP_ONE}`)).toBe(`${FAMILY} ${FLAG_SCOTLAND} ${KEYCAP_ONE}`)
  })

  it('removes unpaired surrogates but keeps proper pairs', () => {
    expect(cleanText(`a${String.fromCharCode(0xd800)}b${String.fromCharCode(0xdc00)}`)).toBe('ab')
    // The wrong way round, these are two unpaired halves.
    expect(cleanText(String.fromCharCode(0xdc00, 0xd83d))).toBe('')
    expect(cleanText(cp(0x1f600))).toBe(cp(0x1f600))
  })

  it('never reads text as HTML or Markdown', () => {
    expect(cleanText('<b>Bold</b> & **stars** [link](x) &amp;')).toBe('<b>Bold</b> & **stars** [link](x) &amp;')
  })

  it('changes nothing the second time', () => {
    for (const text of [` a${cp(9)}b ${cp(0x202e)}c${cp(0, 0x85)} `, `${FAMILY}  ${String.fromCharCode(0xd800)} x`]) {
      expect(cleanText(cleanText(text))).toBe(cleanText(text))
    }
  })
})

describe('splitGraphemes', () => {
  const text = `${FAMILY}${MECHANIC}${THUMB_TONED}${FLAG_GB}${FLAG_FR}${FLAG_SCOTLAND}${KEYCAP_ONE}e${ACUTE}x`
  const parts = [FAMILY, MECHANIC, THUMB_TONED, FLAG_GB, FLAG_FR, FLAG_SCOTLAND, KEYCAP_ONE, `e${ACUTE}`, 'x']

  it('keeps emoji sequences, skin tones, flags, keycaps and accents whole', () => {
    expect(splitGraphemes(text)).toEqual(parts)
    expect(splitGraphemes('')).toEqual([])
  })

  it('keeps the same clusters whole by code points, for browsers without Intl.Segmenter', () => {
    expect(splitCodePoints(text)).toEqual(parts)
    expect(splitCodePoints('设计 review')).toEqual(['设', '计', ' ', 'r', 'e', 'v', 'i', 'e', 'w'])
  })
})

describe('fitLine', () => {
  it('keeps text that fits', () => {
    expect(fitLine('Chassis design review', 200, F10, measure)).toBe('Chassis design review')
  })

  it('measures with 3% slack', () => {
    // 21 characters: 115.5 pt as measured, 119 pt with the slack.
    expect(fitLine('Chassis design review', 119, F10, measure)).toBe('Chassis design review')
    expect(fitLine('Chassis design review', 118, F10, measure)).toBe('Chassis design revi…')
  })

  it('drops a space before the ellipsis', () => {
    expect(fitLine('Chassis design', 51, F10, measure)).toBe('Chassis…')
  })

  it("gives '…' when only the ellipsis fits, and '' when not even that does", () => {
    expect(fitLine('Chassis', 6, F10, measure)).toBe('…')
    expect(fitLine('Chassis', 5, F10, measure)).toBe('')
    expect(fitLine('', 0, F10, measure)).toBe('')
  })

  it('cuts between graphemes, never inside an emoji sequence or between a letter and its accent', () => {
    // Cut by code points, these would end in half a family and in an 'e' without its accent.
    expect(fitLine(`Go ${FAMILY}${FAMILY}`, 80, F10, measure)).toBe(`Go ${FAMILY}…`)
    expect(fitLine(`Cafe${ACUTE} cre${ACUTE}me`, 29, F10, measure)).toBe('Caf…')
  })

  it('cuts Chinese and Arabic at their logical end', () => {
    expect(fitLine('设计评审与签核会议纪要', 35, F10, measure)).toBe('设计评审与…')
    expect(fitLine('مراجعة تصميم الهيكل', 46, F10, measure)).toBe('مراجعة…')
  })

  it('always fits and always ends between graphemes', () => {
    const texts = [
      `Pit crew ${MECHANIC}${MECHANIC}${MECHANIC} training`,
      `Flags ${FLAG_GB}${FLAG_FR}${FLAG_SCOTLAND} and ${THUMB_TONED}${KEYCAP_ONE}`,
      `Cafe${ACUTE} Ame${ACUTE}lie${ACUTE}${ACUTE} cre${ACUTE}me`,
      'नमस्ते दुनिया',
    ]
    for (const text of texts) {
      for (let width = 0; width <= 200; width += 2) {
        const line = fitLine(text, width, F10, measure)
        expect(fitsIn(line, width)).toBe(true)
        expectStretches(text, [line])
      }
    }
  })
})

describe('wrapLines', () => {
  it("gives [''] for empty text, and short text on one line", () => {
    expect(wrapLines('', 100, F10, measure, 2)).toEqual([''])
    expect(wrapLines('Chassis', 100, F10, measure, 2)).toEqual(['Chassis'])
  })

  it('breaks between words and ends the last line with … when the text runs on', () => {
    // 100 pt holds 17 characters.
    const title = 'Front wing endplate manufacturing and testing'
    expect(wrapLines(title, 100, F10, measure, 2)).toEqual(['Front wing', 'endplate manufac…'])
    expect(wrapLines(title, 100, F10, measure, 3)).toEqual(['Front wing', 'endplate', 'manufacturing an…'])
    expect(wrapLines(title, 100, F10, measure, 5)).toEqual(['Front wing', 'endplate', 'manufacturing and', 'testing'])
    expect(wrapLines(title, 100, F10, measure, 1)).toEqual([fitLine(title, 100, F10, measure)])
  })

  it('may break after a hyphen inside a word, and keeps a spaced dash at the end of a line', () => {
    expect(wrapLines('Chassis design review and sign-off', 100, F10, measure, 3)).toEqual([
      'Chassis design',
      'review and sign-',
      'off',
    ])
    // 74 pt holds 13 characters.
    expect(wrapLines('20 Dec 2026 – 14 Jan 2027', 74, F10, measure, 2)).toEqual(['20 Dec 2026 –', '14 Jan 2027'])
    expect(wrapLines('Brakes — front and rear', 51, F10, measure, 3)).toEqual(['Brakes —', 'front and', 'rear'])
    // A dash inside a number range is part of it.
    expect(wrapLines('Plan 2026–27 review', 51, F10, measure, 3)).toEqual(['Plan', '2026–27', 'review'])
  })

  it('breaks a word longer than a line between graphemes', () => {
    // 60 pt holds 10 characters.
    const word = 'Supercalifragilisticexpialidocious'
    expect(wrapLines(word, 60, F10, measure, 4)).toEqual(['Supercalif', 'ragilistic', 'expialidoc', 'ious'])
    expect(wrapLines(word, 60, F10, measure, 3)).toEqual(['Supercalif', 'ragilistic', 'expialido…'])
    expect(wrapLines('An extraordinarilylongword here', 60, F10, measure, 5)).toEqual([
      'An',
      'extraordin',
      'arilylongw',
      'ord here',
    ])
  })

  it('keeps emoji sequences whole when it breaks a run of them', () => {
    // 40 pt holds 7 code points, and each mechanic is 3.
    expect(wrapLines(`Pit crew ${MECHANIC}${MECHANIC}${MECHANIC} training`, 40, F10, measure, 4)).toEqual([
      'Pit',
      'crew',
      `${MECHANIC}${MECHANIC}`,
      `${MECHANIC} tr…`,
    ])
  })

  it('breaks Chinese, written without spaces, between words', () => {
    const text = '设计评审与签核会议纪要'
    const lines = wrapLines(text, 29, F10, measure, 4)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe(text)
    expect(lines.every((line) => fitsIn(line, 29))).toBe(true)
    expectStretches(text, lines, wordParts)
  })

  it('never starts a line with closing punctuation or ends one with opening punctuation', () => {
    const text = '设计，评审。签核（草案）'
    for (let width = 12; width <= 60; width += 1) {
      const lines = wrapLines(text, width, F10, measure, 12)
      expect(lines.join('')).toBe(text)
      for (const line of lines.slice(1)) expect(line).not.toMatch(/^[，。）]/)
      for (const line of lines.slice(0, -1)) expect(line).not.toMatch(/（$/)
    }
    expect(wrapLines('Review (draft), then sign-off', 50, F10, measure, 4)).toEqual([
      'Review',
      '(draft),',
      'then',
      'sign-off',
    ])
  })

  it('breaks Arabic between words, in logical order', () => {
    const lines = wrapLines('مراجعة تصميم الهيكل والتوقيع', 68, F10, measure, 3)
    expect(lines).toEqual(['مراجعة تصميم', 'الهيكل', 'والتوقيع'])
  })

  it('never gives more than maxLines lines, and every line fits and ends between graphemes', () => {
    const texts = [
      'Front wing endplate manufacturing and testing',
      `Pit crew ${MECHANIC}${MECHANIC}${MECHANIC} training ${FAMILY} day`,
      `Cafe${ACUTE} cre${ACUTE}me bru${ACUTE}le${ACUTE}e for the ${FLAG_GB}${FLAG_FR} sponsors`,
      '设计评审与签核会议纪要，然后（草案）发布',
      'مراجعة تصميم الهيكل والتوقيع النهائي',
    ]
    for (const text of texts) {
      for (const maxLines of [1, 2, 3]) {
        for (let width = 0; width <= 150; width += 3) {
          const lines = wrapLines(text, width, F10, measure, maxLines)
          expect(lines.length).toBeGreaterThanOrEqual(1)
          expect(lines.length).toBeLessThanOrEqual(maxLines)
          expect(lines.every((line) => fitsIn(line, width))).toBe(true)
          expectStretches(text, lines)
        }
      }
    }
  })
})

describe('without Intl.Segmenter or Intl.ListFormat (older browsers)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('splits by code points, breaks lines at spaces only and joins lists by hand', async () => {
    vi.stubGlobal('Intl', Object.create(Intl, { Segmenter: { value: undefined }, ListFormat: { value: undefined } }))
    vi.resetModules()
    const text = await import('./exportText')
    expect(text.splitGraphemes(`a${FAMILY}e${ACUTE}${FLAG_GB}`)).toEqual(['a', FAMILY, `e${ACUTE}`, FLAG_GB])
    expect(text.fitLine(`Cafe${ACUTE} cre${ACUTE}me`, 29, F10, measure)).toBe('Caf…')
    // Chinese has no spaces, so it breaks between graphemes.
    expect(text.wrapLines('设计评审与签核会议纪要', 29, F10, measure, 3)).toEqual(['设计评审与', '签核会议纪', '要'])
    expect(text.wrapLines('Front wing endplate manufacturing and testing', 100, F10, measure, 3)).toEqual([
      'Front wing',
      'endplate',
      'manufacturing an…',
    ])
    expect(text.listText([])).toBe('')
    expect(text.listText(['Mechanical'])).toBe('Mechanical')
    expect(text.listText(['Mechanical', 'Electrical'])).toBe('Mechanical and Electrical')
    expect(text.listText(['Mechanical', 'Electrical', 'Admin'])).toBe('Mechanical, Electrical and Admin')
  })
})

describe('dates', () => {
  const plan: Period = { first: '2026-09-01', last: '2027-08-31' }
  const long: Period = { first: '2026-09-01', last: '2029-03-31' }

  it('writes short days with and without the year, in English', () => {
    expect(formatDayShort('2026-12-15', false)).toBe('15 Dec')
    expect(formatDayShort('2026-12-15', true)).toBe('15 Dec 2026')
    expect(formatDayShort('2027-09-01', false)).toBe('1 Sep')
    expect(formatDayShort('', true)).toBe('')
    expect(formatDayShort('nonsense', false)).toBe('')
  })

  it("uses the board's range wording", () => {
    expect(formatRange('2026-11-04', '2026-12-20', plan)).toBe('4 Nov – 20 Dec')
    expect(formatRange(null, '2026-12-20', plan)).toBe('Due 20 Dec')
    expect(formatRange('2026-11-04', null, plan)).toBe('From 4 Nov')
    expect(formatRange(null, null, plan)).toBe('')
    expect(formatRange('nonsense', '2026-12-20', plan)).toBe('Due 20 Dec')
  })

  it('leaves the year out inside a period of 12 months, even across New Year', () => {
    expect(formatRange('2026-12-20', '2027-01-14', plan)).toBe('20 Dec – 14 Jan')
  })

  it('adds years in a period longer than 12 months: once within a year, both across years', () => {
    expect(formatRange('2026-12-20', '2027-01-14', long)).toBe('20 Dec 2026 – 14 Jan 2027')
    expect(formatRange('2027-01-14', '2027-03-03', long)).toBe('14 Jan – 3 Mar 2027')
    expect(formatRange(null, '2028-06-30', long)).toBe('Due 30 Jun 2028')
    expect(formatRange('2028-06-30', null, long)).toBe('From 30 Jun 2028')
  })

  it('adds years when either date is outside the period', () => {
    expect(formatRange('2026-08-20', '2026-09-10', plan)).toBe('20 Aug – 10 Sep 2026')
    expect(formatRange('2027-07-01', '2028-01-10', plan)).toBe('1 Jul 2027 – 10 Jan 2028')
    expect(formatRange(null, '2027-10-03', plan)).toBe('Due 3 Oct 2027')
    expect(formatRange('2026-06-01', null, plan)).toBe('From 1 Jun 2026')
  })

  it("writes a summary row's dates in months, with years on the same rules", () => {
    expect(formatMonthRange('2026-09-07', '2027-07-20', plan)).toBe('Sep – Jul')
    expect(formatMonthRange('2026-09-07', '2026-09-20', plan)).toBe('Sep')
    expect(formatMonthRange('2026-12-01', '2027-02-10', long)).toBe('Dec 2026 – Feb 2027')
    expect(formatMonthRange('2027-01-05', '2027-03-01', long)).toBe('Jan – Mar 2027')
    expect(formatMonthRange('2026-07-01', '2026-10-01', plan)).toBe('Jul – Oct 2026')
    expect(formatMonthRange(null, '2027-03-01', plan)).toBe('Mar')
    expect(formatMonthRange(null, null, plan)).toBe('')
  })

  it('writes the as-of date in full', () => {
    expect(formatAsOf('2026-11-10')).toBe('10 November 2026')
    expect(formatAsOf('2027-01-01')).toBe('1 January 2027')
    expect(formatAsOf('')).toBe('')
  })

  it('writes the time of export in local time', () => {
    // Without a zone, an ISO time is already local, wherever the tests run.
    expect(formatStamp('2026-11-10T14:32:00')).toBe('10 Nov 2026, 14:32')
    expect(formatStamp('2026-11-10T09:05:59.999')).toBe('10 Nov 2026, 09:05')
    const iso = '2026-11-10T14:32:00Z'
    const local = new Date(iso)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const two = (n: number) => String(n).padStart(2, '0')
    const day = `${local.getDate()} ${months[local.getMonth()]} ${local.getFullYear()}`
    expect(formatStamp(iso)).toBe(`${day}, ${two(local.getHours())}:${two(local.getMinutes())}`)
    expect(formatStamp('nonsense')).toBe('')
  })
})

describe('names and lists', () => {
  const member = (username: string, full_name: string, active = true): Member => ({
    username,
    full_name,
    email: `${username}@example.org`,
    github_login: null,
    is_board_admin: false,
    active,
    created_at: '2026-09-01T00:00:00Z',
  })
  const members: Record<string, Member> = {
    js12345: member('js12345', 'Jane Smith'),
    ab12345: member('ab12345', 'Alex Brown'),
    cd12345: member('cd12345', 'Chris Day', false),
    xx12345: member('xx12345', '   '),
    rl12345: member('rl12345', ` Rosa${cp(0x202e)}  Lee${cp(10)}`),
  }

  it('names the first assignee and counts the others', () => {
    expect(ownerText([], members)).toBe('')
    expect(ownerText(['js12345'], members)).toBe('Jane Smith')
    expect(ownerText(['js12345', 'ab12345', 'cd12345'], members)).toBe('Jane Smith +2')
    // Retired members are still named: they did the work.
    expect(ownerText(['cd12345'], members)).toBe('Chris Day')
    expect(ownerText(['js12345', 'js12345'], members)).toBe('Jane Smith')
  })

  it('leaves out unknown and deleted members rather than show a username', () => {
    expect(ownerText(['zz99999'], members)).toBe('')
    expect(ownerText(['zz99999', 'ab12345'], members)).toBe('Alex Brown')
    expect(ownerText(['zz99999', 'ab12345', 'qq11111'], members)).toBe('Alex Brown')
    expect(ownerText(['constructor', 'toString'], members)).toBe('')
    expect(ownerText(['xx12345', 'js12345'], members)).toBe('Jane Smith')
    expect(ownerText(['js12345', 'zz99999'], members)).not.toContain('zz99999')
  })

  it('cleans names', () => {
    expect(ownerText(['rl12345'], members)).toBe('Rosa Lee')
  })

  it('joins lists in British English', () => {
    expect(listText([])).toBe('')
    expect(listText(['Mechanical'])).toBe('Mechanical')
    expect(listText(['Mechanical', 'Electrical'])).toBe('Mechanical and Electrical')
    expect(listText(['Mechanical', 'Electrical', 'Admin'])).toBe('Mechanical, Electrical and Admin')
  })

  it('states the scope in the subtitle', () => {
    const period: Period = { first: '2026-09-01', last: '2027-08-31' }
    const november: Period = { first: '2026-11-01', last: '2026-11-30' }
    expect(subtitleText({ subteams: [], summary: false, filtered: false, period })).toBe(
      'Timeline · All subteams · Sep 2026 – Aug 2027',
    )
    expect(subtitleText({ subteams: ['Mechanical', 'Electrical'], summary: true, filtered: true, period })).toBe(
      'Timeline · Mechanical and Electrical · summary by domain · selected tasks · Sep 2026 – Aug 2027',
    )
    expect(subtitleText({ subteams: ['Admin'], summary: false, filtered: true, period: november })).toBe(
      'Timeline · Admin · selected tasks · Nov 2026',
    )
  })
})

describe('exportFileName', () => {
  const name = (title: string) => exportFileName('Bristol FSAI', title, '2026-11-10')
  const after = ' - Timeline - 2026-11-10'

  it('puts the org, the title, Timeline and the date together, with dashes as hyphens', () => {
    expect(name('2026–27 Plan')).toBe('Bristol FSAI 2026-27 Plan - Timeline - 2026-11-10')
    expect(name('Plan — draft ‒ v2')).toBe(`Bristol FSAI Plan - draft - v2${after}`)
  })

  it('leaves the org out when the title already starts with it', () => {
    expect(name('Bristol FSAI sponsor pack')).toBe(`Bristol FSAI sponsor pack${after}`)
    expect(name('bristol fsai sponsor pack')).toBe(`bristol fsai sponsor pack${after}`)
    expect(name('')).toBe(`Bristol FSAI${after}`)
  })

  it('removes what Windows forbids and control characters, and collapses spaces', () => {
    expect(name('Q3: Sponsor/update? "final" <v2> | *')).toBe(`Bristol FSAI Q3 - Sponsor-update final v2${after}`)
    expect(name(`Plan${cp(7)}   v2${cp(10)}${cp(0x202e)}`)).toBe(`Bristol FSAI Plan v2${after}`)
    expect(name('back\\slash')).toBe(`Bristol FSAI back-slash${after}`)
  })

  it('turns slashes and colons into hyphens, so a year such as 2026/27 keeps its parts', () => {
    expect(name('Sponsor update 2026/27')).toBe(`Bristol FSAI Sponsor update 2026-27${after}`)
    expect(name('Plan / Q3')).toBe(`Bristol FSAI Plan - Q3${after}`)
    expect(name('Review at 10:30')).toBe(`Bristol FSAI Review at 10-30${after}`)
    expect(name('a//b')).toBe(`Bristol FSAI a-b${after}`)
  })

  it('drops trailing dots and spaces', () => {
    expect(name('Plan... ')).toBe(`Bristol FSAI Plan${after}`)
  })

  it('keeps other Unicode', () => {
    expect(name(`Plan für Ökologie 设计 ${MECHANIC}`)).toBe(`Bristol FSAI Plan für Ökologie 设计 ${MECHANIC}${after}`)
  })

  it('stays within 100 characters by shortening the title, never the date, and never inside an emoji', () => {
    const longTitle = name('A'.repeat(200))
    expect(longTitle).toHaveLength(100)
    expect(longTitle.endsWith(after)).toBe(true)

    const emoji = name(cp(0x1f600).repeat(100))
    expect(emoji.length).toBeLessThanOrEqual(100)
    expect(emoji.endsWith(after)).toBe(true)
    expect(cleanText(emoji)).toBe(emoji) // no half emoji left behind

    // A cut that would end on ' - ' drops the dangling hyphen too.
    expect(name(`${'x'.repeat(60)} - ${'y'.repeat(40)}`)).toBe(`Bristol FSAI ${'x'.repeat(60)}${after}`)
  })
})

describe('the status line and alt text', () => {
  function phase(title: string, end: string, state: PlanPhase['state'], color: PlanPhase['color'] = null): PlanPhase {
    return { id: title, number: 1, title, start: '2026-09-01', end, color, state }
  }
  const keyDate = (title: string, date: string, state: PlanKeyDate['state'] = 'upcoming'): PlanKeyDate => ({
    id: title,
    number: 2,
    title,
    date,
    color: null,
    state,
  })
  const subteams = ['Mechanical', 'Electrical', 'Powertrain', 'Software', 'Admin'].map((name) => ({
    name,
    color: 'BLUE' as const,
  }))

  /** A group of tasks: a subteam's, the whole team's ('none') or Not yet scheduled ('undated'). */
  const group = (key: string, name: string, tasks = 1): PlanGroup => ({
    key,
    name,
    color: null,
    lead: '',
    counts: { tasks, done: 0, blocked: 0, overdue: 0, atRisk: 0 },
    span: null,
    rows: [],
    undated: key === 'undated',
  })
  const subteamGroups = (count: number) => subteams.slice(0, count).map((s) => group(`id-${s.name}`, s.name))

  function makePlan(overrides: Partial<Plan> = {}): Plan {
    return {
      format: 'png',
      mode: 'tasks',
      org: 'Bristol Formula Student AI',
      orgShort: 'Bristol FSAI',
      title: '2026–27 Plan',
      subtitle: 'Timeline · All subteams · Sep 2026 – Aug 2027',
      asOf: '2026-11-10',
      exportedAt: '2026-11-10T14:32:00',
      preparedBy: '',
      note: '',
      period: { first: '2026-09-01', last: '2027-08-31' },
      columns: { number: false, owner: false, dates: false, status: true },
      links: false,
      groups: [],
      keyDates: [],
      nextKeyDate: null,
      afterPeriod: null,
      phases: [],
      subteams: [],
      counts: { tasks: 0, done: 0, inProgress: 0, notStarted: 0, blocked: 0, overdue: 0, atRisk: 0 },
      leftOut: { outsidePeriod: 0, undated: 0, rolledUp: 0, archived: 0, keyDatesOutside: 0, phasesOutside: 0 },
      notices: [],
      dependencies: [],
      scope: { subteams: [], filtered: false, query: '' },
      ...overrides,
    }
  }

  const keyDates = ['Design freeze', 'Car shakedown', 'FS UK', 'Budget', 'Sign-off', 'Launch']
  const busy = makePlan({
    subteams,
    groups: subteamGroups(5),
    counts: { tasks: 48, done: 12, inProgress: 25, notStarted: 8, blocked: 3, overdue: 2, atRisk: 0 },
    keyDates: keyDates.map((title) => keyDate(title, '2027-03-01')),
    nextKeyDate: keyDate('Design freeze', '2026-12-15'),
    phases: [
      phase('Concept', '2026-10-31', 'finished'),
      phase('Detailed design', '2026-12-20', 'now'),
      phase('Manufacture', '2027-05-28', 'upcoming'),
    ],
  })

  it("sums up pages and what's on them", () => {
    const shown = '48 tasks in 5 subteams, 6 key dates, 3 phases.'
    expect(statusSentence(busy, 3, 'a4')).toBe(`3 pages, A4 landscape. ${shown}`)
    expect(statusSentence(busy, 1, 'slide')).toBe(`1 slide, 16:9. ${shown}`)
    expect(statusSentence(busy, 2, 'slide')).toBe(`2 slides, 16:9. ${shown}`)
  })

  it('leaves out counts of zero after the tasks', () => {
    const small = makePlan({ subteams: subteams.slice(0, 1), groups: subteamGroups(1), counts: { ...busy.counts, tasks: 1 } })
    expect(statusSentence(small, 1, 'a3')).toBe('1 page, A3 landscape. 1 task in 1 subteam.')
    const lanesOnly = makePlan({ keyDates: [keyDate('FS UK', '2027-07-15')] })
    expect(statusSentence(lanesOnly, 1, 'a4')).toBe('1 page, A4 landscape. No tasks, 1 key date.')
    const wholeTeam = makePlan({ groups: [group('none', 'Whole team', 3)], counts: { ...busy.counts, tasks: 3 } })
    expect(statusSentence(wholeTeam, 1, 'a4')).toBe('1 page, A4 landscape. 3 tasks for the whole team.')
  })

  it('counts the subteams the tasks are in, not those with only a key date or a phase', () => {
    // The legend lists five subteams, but the tasks are in Mechanical and the whole team.
    const groups = [group('id-Mechanical', 'Mechanical', 2), group('none', 'Whole team', 1)]
    const p = makePlan({ subteams, groups, counts: { ...busy.counts, tasks: 3 } })
    expect(statusSentence(p, 1, 'a4')).toBe('1 page, A4 landscape. 3 tasks in 1 subteam and the whole team.')
    expect(altText(p)).toContain(': 3 tasks in 1 subteam and the whole team, 12 done,')
  })

  it('says how many tasks are listed as not yet scheduled, and never says no tasks above them', () => {
    const none = { ...busy.counts, tasks: 0, done: 0, blocked: 0, overdue: 0, atRisk: 0 }
    const onlyLater = makePlan({ groups: [group('undated', 'Not yet scheduled', 2)], counts: none })
    expect(statusSentence(onlyLater, 1, 'a4')).toBe('1 page, A4 landscape. No scheduled tasks, 2 not yet scheduled.')
    const groups = [group('none', 'Whole team', 3), group('undated', 'Not yet scheduled', 2)]
    const both = makePlan({ groups, counts: { ...none, tasks: 3 } })
    expect(statusSentence(both, 1, 'a4')).toBe('1 page, A4 landscape. 3 tasks for the whole team, 2 not yet scheduled.')
  })

  it('describes a slide in sentences', () => {
    expect(altText(busy)).toBe(
      'Gantt chart of the Bristol Formula Student AI 2026–27 Plan, Sep 2026 to Aug 2027, as of 10 November 2026: ' +
        '48 tasks in 5 subteams, 12 done, 3 blocked, 2 overdue. Current phase: Detailed design, until 20 Dec. ' +
        'Next key date: Design freeze, 15 Dec 2026.',
    )
  })

  it('leaves out what the plan lacks', () => {
    expect(altText(makePlan({ period: { first: '2026-11-01', last: '2026-11-30' } }))).toBe(
      'Gantt chart of the Bristol Formula Student AI 2026–27 Plan, Nov 2026, as of 10 November 2026: no tasks.',
    )
    const counts = { ...busy.counts, tasks: 4, done: 0, blocked: 0, overdue: 0, atRisk: 1 }
    expect(altText(makePlan({ subteams: subteams.slice(0, 2), groups: subteamGroups(2), counts }))).toBe(
      'Gantt chart of the Bristol Formula Student AI 2026–27 Plan, Sep 2026 to Aug 2027, as of 10 November 2026: ' +
        '4 tasks in 2 subteams, 1 at risk.',
    )
  })

  it("doesn't repeat the org when the title starts with it", () => {
    expect(altText(makePlan({ title: 'Bristol FSAI sponsor update' }))).toMatch(
      /^Gantt chart of the Bristol FSAI sponsor update, /,
    )
    expect(altText(makePlan({ title: 'Bristol Formula Student AI plan' }))).toMatch(
      /^Gantt chart of the Bristol Formula Student AI plan, /,
    )
  })

  it("names the whole team's current phase first, with years where needed, and an at-risk key date", () => {
    const chassis = phase('Chassis build', '2027-01-15', 'now', 'GREEN')
    const plan = makePlan({
      period: { first: '2026-09-01', last: '2028-08-31' },
      phases: [chassis, phase('Detailed design', '2027-02-20', 'now')],
      nextKeyDate: keyDate('Design freeze', '2026-12-15', 'atRisk'),
    })
    expect(altText(plan)).toMatch(
      / Current phase: Detailed design, until 20 Feb 2027\. Next key date: Design freeze, 15 Dec 2026, at risk\.$/,
    )
    expect(altText(makePlan({ phases: [chassis] }))).toContain('Current phase: Chassis build, until 15 Jan.')
  })
})

describe('right-to-left names', () => {
  const FSI = '⁨'
  const PDI = '⁩'

  it('sets apart text with Hebrew or Arabic letters, so the numbers after it keep their place', () => {
    expect(isolate('סקירת תכן')).toBe(`${FSI}סקירת תכן${PDI}`)
    expect(isolate('مراجعة التصميم')).toBe(`${FSI}مراجعة التصميم${PDI}`)
  })

  it('leaves other text as it is, accents, Chinese and emoji included', () => {
    for (const text of ['Design freeze', 'Évaluation thermique', '电池热测试 🔋', '']) expect(isolate(text)).toBe(text)
  })

  it('sets apart only the name of an owner, before its +N', () => {
    expect(isolateOwner('דנה לוי +2')).toBe(`${FSI}דנה לוי${PDI} +2`)
    expect(isolateOwner('דנה ל.')).toBe(`${FSI}דנה ל.${PDI}`)
    expect(isolateOwner('Jane Smith +1')).toBe('Jane Smith +1')
  })

  it('is undone by cleanText, so it goes on last', () => {
    expect(cleanText(isolate('דנה לוי'))).toBe('דנה לוי')
  })
})
