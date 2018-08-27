// tslint:disable:max-file-line-count
// todo del
// todo rename to parser instead of lexer

import { modes } from '../src/ENM.modes'
import { state, TResult } from '../src/VAR.state'
import { utils } from '../src/VAR.utils'



const test = `
    foo

    bar

    [filesection name=foo]
    body
    of
    fs
    [/filesection]

    baz

    quux

    [filesection name=foo]
    body
    of
    fs2
    [/filesection]

    qqq

    [filesection name=foo]
    body
    of
    fs3
    [/filesection]

    `

function findFileSections(text: string): TResult {

    state.input.set(text)

    return state.next(0)
}

findFileSections(test)
