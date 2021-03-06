// tslint:disable:max-file-line-count
import { Subject, Subscription } from 'rxjs'
import { filter, takeUntil } from 'rxjs/operators'
import { modes, TMode } from './ENM.modes'
import { CONSTANTS } from './VAR.constants'
import { settings } from './VAR.settings'

export type TResult = any[] // todo

type TChange = {
    previous: number,
    new: number,
}

type TChangesSubject = Subject<TChange> & {
    subscriptions: {
        [key: string]: Subscription,
    },
}

export const state = {
    input: {
        val: '',
        set(val: string) {
            this.val = val
        },
    },
    line: {
        val: 0,
        increment() {
            this.val++
        },
    },
    _pos: 0,
    set pos(val) {
        const previous = this._pos

        this._pos = val

        const posChange: TChange = {
            previous,
            new: this._pos,
        }

        this.pos$.next(posChange)
    },
    get pos() {
        return this._pos
    },
    get pos$(): TChangesSubject {
        // tslint:disable-next-line:prefer-const
        const subject = new Subject<TChange>()
        const changesSubject: TChangesSubject = subject as TChangesSubject

        changesSubject.subscriptions = {}

        return changesSubject
    },
    char: {
        val: null as string | null,
        get isWhitespace() {
            if (this.val === null) {
                throw state.error(`state.char.val cannot be null,
                the program definitely has some error`)
            }

            if ([' ', '\r', '\n', '\t'].includes(this.val)) {
                if (this.val === '\n') {
                    state.line.increment()
                }

                return true
            }
        },
        get isalpha() {
            const c = this.val!
            return (c >= 'a' && c <= 'z') ||
                (c >= 'A' && c <= 'Z') ||
                c === '_' || c === '$'
        },
    },
    fileSectionLevel: {
        val: 0,
        increment() {
            this.val++
        },
        decrement() {
            this.val--
        },
    },
    quotedContentInProgress: {
        enabled: false,
        quoteType: '' as '' | '\'' | '"',
        start(quoteType: '' | '\'' | '"') {
            this.enabled = true
            this.quoteType = quoteType
        },
        finish() {
            this.enabled = false
            this.quoteType = ''
        },
    },
    result: {
        val: [] as (string | object)[],
        push(item: string | object) {
            this.val.push(item)
        },
    },
    nonSectionedContentBuffer: {
        val: '',
        add(char: string) {
            this.val += char
        },
    },
    // todo move state.level to this object
    currentFilesection: {
        currentAttribute: {
            name: '',
            value: '',
            addCharToName() {
                this.name += state.char.val
            },
            addCharsToValue(chars: string) {
                this.value += chars
            },
            finish() {
                this.name = ''
                this.value = ''
            },
        },
        attributes: {} as { [key: string]: string },
        add(attr: string, value: string) {
            this.attributes[attr] = value
        },
        // finish() {
        // todo 
        // }
    },
    mode: {
        val: modes.START as TMode,
        set(mode: TMode) {
            this.val = mode
        },
    },
    increment(offset: number) {
        this.pos = this.pos + offset
    },
    processNonSectionedContentChar() {
        this.mode.val = modes.NON_SECTIONED_CONTENT_IN_PROGRESS

        if (this.char.val === null) {
            throw state.error('state.char cannot be null, the program definitely has some error')
        }

        this.nonSectionedContentBuffer.add(this.char.val)

        return (() => this.next(1))()
    },
    next(offset: number): TResult {

        const newPos = this.pos + offset

        if (this.pos > 0) {
            if (offset <= 0) {
                throw state.error(`The passed offset can equal 0
                only at the very first iteration of state.next().
                \Each next iteration should have greater than 0 offset`)
            }
        }

        this.pos = newPos
        this.char.val = this.input.val.charAt(this.pos)

        return ((): any => {

            if (this.pos >= this.input.val.length) {
                return this.result.val
            }

            switch (this.mode.val) {
                case modes.START:
                case modes.NON_SECTIONED_CONTENT_IN_PROGRESS:
                    if (settings.commentToken.length) {

                        const ct = settings.commentToken

                        if (this.input.val.substring(this.pos, ct.length) === ct) {
                            this.mode.set(modes.EXPECT_OPENING_BRACKET)
                            return this.next(settings.commentToken.length)
                        } else {
                            return this.processNonSectionedContentChar()
                        }
                    } else {
                        switch (this.char.val) {
                            case '[':
                                this.mode.set(modes.EXPECT_FILESECTION_OPENING_TAGNAME)
                                return this.next(1)
                            default:
                                return this.processNonSectionedContentChar()
                        }
                    }
                case modes.EXPECT_OPENING_BRACKET:
                    switch (this.char.val) {
                        case '[':
                            this.mode.set(modes.EXPECT_FILESECTION_OPENING_TAGNAME)
                            return this.next(1)
                        default:
                            return this.processNonSectionedContentChar()
                    }
                case modes.EXPECT_FILESECTION_OPENING_TAGNAME:
                    if (this.char.isWhitespace) {
                        return this.next(1)
                    } else {
                        const tag = CONSTANTS.TAG_NAME

                        if (this.input.val.substring(this.pos, this.pos + tag.length) === tag) {
                            this.mode.set(modes.EXPECT_ATTRIBUTE)
                            return this.next(tag.length)
                        }

                        this.mode.set(modes.NON_SECTIONED_CONTENT_IN_PROGRESS)
                        return this.next(1)
                    }
                case modes.EXPECT_ATTRIBUTE:
                    if (this.char.isWhitespace) {
                        return this.next(1)
                    }

                    if (this.char.isalpha) {
                        this.mode.set(modes.ATTRIBUTE_NAME_IN_PROGRESS)
                        this.currentFilesection.currentAttribute.addCharToName()
                        return this.next(1)
                    }

                    if (this.char.val === ']') {

                        // expect closing bracket, but only if "name" or "vendor" attributes already defined
                        if (
                            Object.keys(this.currentFilesection.attributes).some(
                                attr => ['vendor', 'name'].includes(attr),
                            )
                        ) {
                            this.mode.set(modes.FILESECTION_BODY_IN_PROGRESS)
                            return this.next(1)
                        } else {
                            throw state.error(`Filesection must have at least
                            one of these attributes: "vendor", "name"`)
                        }
                    }

                    throw state.error(`Unexpected token "${this.char.val}",
                    expected attribute name`)
                // todo at file, line, position

                case modes.ATTRIBUTE_NAME_IN_PROGRESS:
                    if (this.char.isalpha) {
                        return this.next(1)
                    }

                    if (this.char.isWhitespace) {
                        const attr = this.currentFilesection.currentAttribute
                        this.currentFilesection.attributes[attr.name] = ''

                        this.mode.set(modes.EXPECT_EQUAL_SIGN_BETWEEN_ATTRIBUTE_AND_VALUE)
                        return this.next(1)
                    }

                    if (this.char.val === '=') {
                        this.mode.set(modes.EXPECT_ATTRIBUTE_VALUE)
                        return this.next(1)
                    }

                    throw state.error(`Unexpected token "${this.char.val}",
                    expected valid character for attribute name`)
                // todo at file, line, position
                case modes.EXPECT_EQUAL_SIGN_BETWEEN_ATTRIBUTE_AND_VALUE:
                    if (this.char.val === '=') {
                        this.mode.set(modes.EXPECT_ATTRIBUTE_VALUE)
                        return this.next(1)
                    }
                    throw state.error(`Unexpected token "${this.char.val}", expected equal sign`)
                case modes.EXPECT_ATTRIBUTE_VALUE:
                    if (this.char.isWhitespace) {
                        return this.next(1)
                    }

                    if (['\'', '"'].includes(this.char.val)) {

                        this.quotedContentInProgress.start(this.char.val as '\'' | '"')
                        this.mode.set(modes.QUOTTED_ATTRIBUTE_VALUE_IN_PROGRESS)
                        return this.next(1)
                    }

                    if (this.char.isalpha) {
                        this.mode.set(modes.UNQUOTTED_ATTRIBUTE_VALUE_IN_PROGRESS)
                        this.currentFilesection.currentAttribute.addCharToValue()
                        return this.next(1)
                    }

                    throw state.error(`Unexpected token "${this.char.val}",
                    expected attribute value`)
                case modes.QUOTTED_ATTRIBUTE_VALUE_IN_PROGRESS:

                    this.changes$.pipe(
                        (takeUntil(this.mode.val.changes$.pipe(
                            filter((change: TChange) => change.new !== modes.QUOTTED_ATTRIBUTE_VALUE_IN_PROGRESS),
                        ))),
                    ).subscribeOnce((posChange) => {
                        // every time state.pos changes while in this QUOTTED_ATTRIBUTE_VALUE_IN_PROGRESS mode,
                        // add processed chars to the current attribute's value
                        // (attribute has name and value, we add to the latter)

                        // also consider cases when delta between prev and curr is more than one,
                        // in this case all processed characters should be added to attributes value
                        const processedChars = this.input.val.substring(posChange.previous, posChange.new)

                        this.currentFilesection.currentAttribute.addCharsToValue(processedChars)
                    })



                    if (this.char.val === this.quotedContentInProgress.quoteType) {



                        // skip the case when the quote is escaped
                        if (this.input.val.charAt(this.pos - 1) === '\\') {
                            return this.next(1)
                        }

                        this.quotedContentInProgress.finish()

                        // expect next attribute (or closing bracket)
                        this.mode.set(modes.EXPECT_ATTRIBUTE)
                        return this.next(1)
                    }

                    if (this.pos >= this.input.val.length) {
                        throw state.error(`An unclosed quote encountered.
                        The opening quote is located at `)
                        // todo file? line and position
                    }

                    if (this.char.val === '\n') {
                        throw state.error(`The attribute value must not contain a new line`)
                    }

                    // any character other than unescaped quote and new line is ok in a quotted string
                    return this.next(1)
                case modes.UNQUOTTED_ATTRIBUTE_VALUE_IN_PROGRESS:

                    if (this.char.isalpha) {
                        // todo 
                    }


                    throw??
                // todo 
                default:
                    throw state.error('unexpected mode: ' + state.mode)
            }
        })()

        throw state.error('program somehow has reached this point, though it MUST NOT')
    },
    error(msg: string) {
        return new Error(`[filesections-parser] ${msg}`)
    },
}
