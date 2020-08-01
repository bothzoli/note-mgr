const fs = require("fs")
import { prompt } from "inquirer"
import dayjs from "dayjs"
import chalk from "chalk"
import kebabCase from "lodash.kebabcase"
import { Config, validateDt } from "./utils"
import { Command } from "commander"
require("dotenv").config()
const fsPromises = fs.promises

enum FrontmatterKeys {
    Category = "Category",
    Date = "DateKey",
    PrivateKey = "PrivateKey",
    Publish = "Publish",
    Slug = "Slug",
    Tags = "Tags",
    Title = "Title",
}

export async function newNote(title: string | undefined, args: Command) {
    if (!title && !args.title && !args.interactive)
        return console.log(
            chalk.bold.red(
                "A new notes needs a title unless generated interactively (`-i`)."
            )
        )

    const config = await new Config()
    const options = await parseOptions(args, config)
    if (args.interactive) {
        await solicitOptions(title, config, options)
    }

    const notes = (await config.nomNotesPath) as string
    const file = (options.get(FrontmatterKeys.Slug) ||
        kebabCase(options.get(FrontmatterKeys.Title))) as string
    const ext = (options.get("FileExtension") ||
        (await config.defaultFileExt)) as string
    const combinedPath = `${notes}/${file}.${ext}`
    createNote(combinedPath, options)
    // todo: add it to `.notes`
}

async function solicitOptions(
    title: string | undefined,
    config: Config,
    options: Map<any, any>
) {
    const defaultDateFmt = await config.defaultDateFormat
    const questions = [
        {
            type: "input",
            name: FrontmatterKeys.Title,
            message: "What's the title for the note?",
            default: options.get("title") || title,
        },
        {
            type: "input",
            name: FrontmatterKeys.Slug,
            message: "What's the slug for the note?",
            default: options.get("slug") || kebabCase(title),
        },
        {
            type: "input",
            name: FrontmatterKeys.Category,
            message: "What's the category for the note?",
            default: options.get("category"),
        },
        {
            type: "input",
            name: FrontmatterKeys.Tags,
            message: "Any tags for the note? (Comma separated)",
            default: options.get("tags"),
            filter: (args: any) =>
                args.split(",").map((tag: string) => tag.trim()),
        },
        {
            type: "input",
            name: FrontmatterKeys.Date,
            message: "What is the date for the note?",
            default: dayjs().format(defaultDateFmt),
            validate: (args: string) => {
                validateDt(args, defaultDateFmt)
            },
            filter: (args: any) => dayjs(args).format(defaultDateFmt),
        },
        {
            type: "input",
            name: FrontmatterKeys.Publish,
            message: "What is the publish date for the note?",
            default: dayjs().format(defaultDateFmt),
            validate: (args: string) => {
                validateDt(args, defaultDateFmt)
            },
            filter: (args: any) => dayjs(args).format(defaultDateFmt),
        },
        {
            type: "confirm",
            name: "AltPrivate",
            message: "Is the note public?",
        },
        {
            type: "list",
            name: FrontmatterKeys.PrivateKey,
            message: "Is the note private?",
            choices: [
                { value: false, name: "No" },
                { value: true, name: "Yes" },
            ],
        },
        {
            type: "input",
            name: "FileExtension",
            message: "What's the file extension?",
            default: config.defaultFileExt,
        },
    ]

    await prompt(questions).then((answers) => {
        updateOptions(options, FrontmatterKeys.Category, answers.Category)
        updateOptions(options, FrontmatterKeys.Date, answers.DateKey)
        updateOptions(options, "FileExtension", answers.FileExtension)
        updateOptions(options, FrontmatterKeys.PrivateKey, answers.PrivateKey)
        updateOptions(options, FrontmatterKeys.Publish, answers.Publish)
        updateOptions(options, FrontmatterKeys.Slug, answers.Slug)
        updateOptions(options, FrontmatterKeys.Tags, answers.Tags)
        updateOptions(options, FrontmatterKeys.Title, answers.Title)
    })
}

async function createNote(filePath: string, options: Map<any, any>) {
    // const noteIndex = config.get(ConfigurationKeys.NOTES_INDEX_FILE) // don't need this here, need it in the function that adds to the indexFile

    fsPromises
        .access(filePath)
        .then(() =>
            console.log(
                chalk.red.bold(
                    `${filePath} already exists. Perhaps you meant to edit it instead?`
                )
            )
        )
        .catch(() => {
            fs.writeFile(
                filePath,
                genFrontmatter(options),
                (error: Error | null) => {
                    if (error)
                        throw new Error(
                            `Failed to create ${filePath} at path.\n${error.message}`
                        )
                }
            )
        })
}

function genFrontmatter(options: Map<any, any>) {
    let frontmatter = ""
    for (let [key, val] of options) {
        if (key === "PrivateKey") {
            frontmatter += `Private: ${val}` // special handling due to private being a restricted word in JS
        } else if (typeof val === "string") {
            frontmatter += `${key}: "${val}"`
        } else if (Array.isArray(val)) {
            frontmatter += `${key}: [${val.map((el) => `"${el}"`).join(", ")}]`
        } else {
            frontmatter += `# ${key}: undefined`
        }
        frontmatter += `\n`
    }
    return `---\n${frontmatter}---\n
    `
}

async function parseOptions(args: any, config: Config) {
    const defaultDateFormat = await config.defaultDateFormat
    const TODAY = dayjs().format("YYYY-MM-DD")
    const title = args.args[0] || args.title
    const slug = args.slug || kebabCase(title)
    const { category, date, private: privateKey, publish, tags, custom } = args

    let cliSetOptions = new Map()

    updateOptions(cliSetOptions, FrontmatterKeys.Category, category)
    updateOptions(
        cliSetOptions,
        FrontmatterKeys.Date,
        (validateDt(date, defaultDateFormat) && date) || TODAY
    )
    updateOptions(cliSetOptions, FrontmatterKeys.Title, title)
    updateOptions(
        cliSetOptions,
        FrontmatterKeys.PrivateKey,
        privateKey || false
    )
    updateOptions(
        cliSetOptions,
        FrontmatterKeys.Publish,
        (validateDt(publish, defaultDateFormat) && publish) || TODAY
    )
    updateOptions(cliSetOptions, FrontmatterKeys.Slug, slug)
    updateOptions(cliSetOptions, FrontmatterKeys.Tags, tags)
    parseCustom(cliSetOptions, custom)
    return cliSetOptions
}

function updateOptions(
    optionsMap: Map<any, any>,
    key: FrontmatterKeys | "FileExtension",
    value?: any
) {
    optionsMap.set(key, value)
}

function parseCustom(cliSetOptions: Map<any, any>, customArgs: string[]) {
    customArgs?.map((el) => {
        const [key, value] = el.split(":")
        cliSetOptions.set(key, value)
    })
}
