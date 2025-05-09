function __liftString(pointer, memory) {
    if (!pointer) return null;
    const end = (pointer + new Uint32Array(memory.buffer)[(pointer - 4) >>> 2]) >>> 1,
        memoryU16 = new Uint16Array(memory.buffer);
    let start = pointer >>> 1,
        string = '';
    while (end - start > 1024) {
        const a = memoryU16.subarray(start, (start += 1024));
        string += String.fromCharCode(...a);
    }
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
}

function log(text, memory) {
    text = __liftString(text >>> 0, memory);
    console.log(`CONTRACT LOG: ${text}`);
}

export default {
    /**
     * A set of globs passed to the glob package that qualify typescript files for testing.
     */
    entries: ['src/__tests__/**/*.spec.ts'],
    /**
     * A set of globs passed to the glob package that quality files to be added to each test.
     */
    include: ['src/__tests__/**/*.include.ts'],
    /**
     * A set of regexp that will disclude source files from testing.
     */
    disclude: [/node_modules/],
    /**
     * Add your required AssemblyScript imports here.
     */
    async instantiate(memory, createImports, instantiate, binary) {
        let memory2;
        const resp = instantiate(
            binary,
            createImports({
                env: {
                    memory,
                    'console.log': (data) => {
                        log(data, memory2);
                    },
                },
            }),
        );

        const { exports } = await resp;
        memory2 = exports.memory || memory;

        return resp;
    },
    /** Enable code coverage. */
    coverage: [
        'src/contracts/**/*.ts',
        'src/contracts/*.ts',
        'src/data-types/**/*.ts',
        'src/data-types/*.ts',
        'src/utils/**/*.ts',
        'src/utils/*.ts',
        'src/events/**/*.ts',
        'src/events/*.ts',
        'src/lib/**/*.ts',
        'src/lib/*.ts',
        'src/math/**/*.ts',
        'src/math/*.ts',
        'src/stored/**/*.ts',
        'src/stored/*.ts',
        'src/index.ts',
    ],
    /**
     * Specify if the binary wasm file should be written to the file system.
     */
    outputBinary: false,
};
