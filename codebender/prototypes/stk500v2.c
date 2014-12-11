static int stk500v2_recv(PROGRAMMER * pgm, unsigned char *msg, size_t maxsize) {
    enum states { sINIT, sSTART, sSEQNUM, sSIZE1, sSIZE2, sTOKEN, sDATA, sCSUM, sDONE }  state = sSTART;
    unsigned int msglen = 0;
    unsigned int curlen = 0;
    int timeout = 0;
    unsigned char c, checksum = 0;

    long timeoutval = SERIAL_TIMEOUT;		// seconds
    struct timeval tv;
    double tstart, tnow;

    if (PDATA(pgm)->pgmtype == PGMTYPE_AVRISP_MKII ||
        PDATA(pgm)->pgmtype == PGMTYPE_STK600)
        return stk500v2_recv_mk2(pgm, msg, maxsize);
    else if (PDATA(pgm)->pgmtype == PGMTYPE_JTAGICE_MKII)
        return stk500v2_jtagmkII_recv(pgm, msg, maxsize);
    else if (PDATA(pgm)->pgmtype == PGMTYPE_JTAGICE3)
        return stk500v2_jtag3_recv(pgm, msg, maxsize);

    DEBUG("STK500V2: stk500v2_recv(): ");

    gettimeofday(&tv, NULL);
    tstart = tv.tv_sec;

    while ( (state != sDONE ) && (!timeout) ) {
        if (serial_recv(&pgm->fd, &c, 1) < 0)
            goto timedout;
        DEBUG("0x%02x ",c);
        checksum ^= c;

        switch (state) {
        case sSTART:
            DEBUGRECV("hoping for start token...");
            if (c == MESSAGE_START) {
                DEBUGRECV("got it\n");
                checksum = MESSAGE_START;
                state = sSEQNUM;
            } else
                DEBUGRECV("sorry\n");
            break;
        case sSEQNUM:
            DEBUGRECV("hoping for sequence...\n");
            if (c == PDATA(pgm)->command_sequence) {
                DEBUGRECV("got it, incrementing\n");
                state = sSIZE1;
                PDATA(pgm)->command_sequence++;
            } else {
                DEBUGRECV("sorry\n");
                state = sSTART;
            }
            break;
        case sSIZE1:
            DEBUGRECV("hoping for size LSB\n");
            msglen = (unsigned)c * 256;
            state = sSIZE2;
            break;
        case sSIZE2:
            DEBUGRECV("hoping for size MSB...");
            msglen += (unsigned)c;
            DEBUG(" msg is %u bytes\n",msglen);
            state = sTOKEN;
            break;
        case sTOKEN:
            if (c == TOKEN) state = sDATA;
            else state = sSTART;
            break;
        case sDATA:
            if (curlen < maxsize) {
                msg[curlen] = c;
            } else {
                fprintf(stderr, "%s: stk500v2_recv(): buffer too small, received %d byte into %u byte buffer\n",
                        progname,curlen,(unsigned int)maxsize);
                return -2;
            }
            if ((curlen == 0) && (msg[0] == ANSWER_CKSUM_ERROR)) {
                fprintf(stderr, "%s: stk500v2_recv(): previous packet sent with wrong checksum\n",
                        progname);
                return -3;
            }
            curlen++;
            if (curlen == msglen) state = sCSUM;
            break;
        case sCSUM:
            if (checksum == 0) {
                state = sDONE;
            } else {
                state = sSTART;
                fprintf(stderr, "%s: stk500v2_recv(): checksum error\n",
                        progname);
                return -4;
            }
            break;
        default:
            fprintf(stderr, "%s: stk500v2_recv(): unknown state\n",
                    progname);
            return -5;
        } /* switch */

        gettimeofday(&tv, NULL);
        tnow = tv.tv_sec;
        if (tnow-tstart > timeoutval) {			// wuff - signed/unsigned/overflow
        timedout:
            fprintf(stderr, "%s: stk500v2_ReceiveMessage(): timeout\n",
                    progname);
            return -1;
        }

    } /* while */
    DEBUG("\n");

    return (int)(msglen+6);
}

static int stk500v2_command(PROGRAMMER * pgm, unsigned char * buf,
                            size_t len, size_t maxlen) {
    int i;
    int tries = 0;
    int status;

    DEBUG("STK500V2: stk500v2_command(");
    for (i=0;i<len;i++) DEBUG("0x%02x ",buf[i]);
    DEBUG(", %d)\n",len);

retry:
    tries++;

    // send the command to the programmer
    stk500v2_send(pgm,buf,len);
    // attempt to read the status back
    status = stk500v2_recv(pgm,buf,maxlen);

    // if we got a successful readback, return
    if (status > 0) {
        DEBUG(" = %d\n",status);
        if (status < 2) {
            fprintf(stderr, "%s: stk500v2_command(): short reply\n", progname);
            return -1;
        }
        if (buf[0] == CMD_XPROG_SETMODE || buf[0] == CMD_XPROG) {
            /*
             * Decode XPROG wrapper errors.
             */
            const char *msg;
            int i;

            /*
             * For CMD_XPROG_SETMODE, the status is returned in buf[1].
             * For CMD_XPROG, buf[1] contains the XPRG_CMD_* command, and
             * buf[2] contains the status.
             */
            i = buf[0] == CMD_XPROG_SETMODE? 1: 2;

            if (buf[i] != XPRG_ERR_OK) {
                switch (buf[i]) {
                case XPRG_ERR_FAILED:   msg = "Failed"; break;
                case XPRG_ERR_COLLISION: msg = "Collision"; break;
                case XPRG_ERR_TIMEOUT:  msg = "Timeout"; break;
                default:                msg = "Unknown"; break;
                }
                fprintf(stderr, "%s: stk500v2_command(): error in %s: %s\n",
                        progname,
                        (buf[0] == CMD_XPROG_SETMODE? "CMD_XPROG_SETMODE": "CMD_XPROG"),
                        msg);
                return -1;
            }
            return 0;
        } else {
            /*
             * Decode STK500v2 errors.
             */
            if (buf[1] >= STATUS_CMD_TOUT && buf[1] < 0xa0) {
                const char *msg;
                char msgbuf[30];
                switch (buf[1]) {
                case STATUS_CMD_TOUT:
                    msg = "Command timed out";
                    break;

                case STATUS_RDY_BSY_TOUT:
                    msg = "Sampling of the RDY/nBSY pin timed out";
                    break;

                case STATUS_SET_PARAM_MISSING:
                    msg = "The `Set Device Parameters' have not been "
                        "executed in advance of this command";

                default:
                    sprintf(msgbuf, "unknown, code 0x%02x", buf[1]);
                    msg = msgbuf;
                    break;
                }
                if (quell_progress < 2) {
                    fprintf(stderr, "%s: stk500v2_command(): warning: %s\n",
                            progname, msg);
                }
            } else if (buf[1] == STATUS_CMD_OK) {
                return status;
            } else if (buf[1] == STATUS_CMD_FAILED) {
                fprintf(stderr,
                        "%s: stk500v2_command(): command failed\n",
                        progname);
            } else if (buf[1] == STATUS_CMD_UNKNOWN) {
                fprintf(stderr,
                        "%s: stk500v2_command(): unknown command\n",
                        progname);
            } else {
                fprintf(stderr, "%s: stk500v2_command(): unknown status 0x%02x\n",
                        progname, buf[1]);
            }
            return -1;
        }
    }

    // otherwise try to sync up again
    status = stk500v2_getsync(pgm);
    if (status != 0) {
        if (tries > RETRIES) {
            fprintf(stderr,"%s: stk500v2_command(): failed miserably to execute command 0x%02x\n",
                    progname,buf[0]);
            return -1;
        } else
            goto retry;
    }

    DEBUG(" = 0\n");
    return 0;
}

static int stk500v2_cmd(PROGRAMMER * pgm, const unsigned char *cmd,
                        unsigned char *res)
{
    unsigned char buf[8];
    int result;

    DEBUG("STK500V2: stk500v2_cmd(%02x,%02x,%02x,%02x)\n",cmd[0],cmd[1],cmd[2],cmd[3]);

    buf[0] = CMD_SPI_MULTI;
    buf[1] = 4;
    buf[2] = 4;
    buf[3] = 0;
    buf[4] = cmd[0];
    buf[5] = cmd[1];
    buf[6] = cmd[2];
    buf[7] = cmd[3];

    result = stk500v2_command(pgm, buf, 8, sizeof(buf));
    if (result < 0) {
        fprintf(stderr, "%s: stk500v2_cmd(): failed to send command\n",
                progname);
        return -1;
    } else if (result < 6) {
        fprintf(stderr, "%s: stk500v2_cmd(): short reply, len = %d\n",
                progname, result);
        return -1;
    }

    res[0] = buf[2];
    res[1] = buf[3];
    res[2] = buf[4];
    res[3] = buf[5];

    return 0;
}

int stk500v2_getsync(PROGRAMMER * pgm) {
    int tries = 0;
    unsigned char buf[1], resp[32];
    int status;

    DEBUG("STK500V2: stk500v2_getsync()\n");

    if (PDATA(pgm)->pgmtype == PGMTYPE_JTAGICE_MKII ||
        PDATA(pgm)->pgmtype == PGMTYPE_JTAGICE3)
        return 0;

retry:
    tries++;

    // send the sync command and see if we can get there
    buf[0] = CMD_SIGN_ON;
    stk500v2_send(pgm, buf, 1);

    // try to get the response back and see where we got
    status = stk500v2_recv(pgm, resp, sizeof(resp));

    // if we got bytes returned, check to see what came back
    if (status > 0) {
        if ((resp[0] == CMD_SIGN_ON) && (resp[1] == STATUS_CMD_OK) &&
            (status > 3)) {
            // success!
            unsigned int siglen = resp[2];
            if (siglen >= strlen("STK500_2") &&
                memcmp(resp + 3, "STK500_2", strlen("STK500_2")) == 0) {
                PDATA(pgm)->pgmtype = PGMTYPE_STK500;
            } else if (siglen >= strlen("AVRISP_2") &&
                       memcmp(resp + 3, "AVRISP_2", strlen("AVRISP_2")) == 0) {
                PDATA(pgm)->pgmtype = PGMTYPE_AVRISP;
            } else if (siglen >= strlen("AVRISP_MK2") &&
                       memcmp(resp + 3, "AVRISP_MK2", strlen("AVRISP_MK2")) == 0) {
                PDATA(pgm)->pgmtype = PGMTYPE_AVRISP_MKII;
            } else if (siglen >= strlen("STK600") &&
                       memcmp(resp + 3, "STK600", strlen("STK600")) == 0) {
                PDATA(pgm)->pgmtype = PGMTYPE_STK600;
            } else {
                resp[siglen + 3] = 0;
                if (verbose)
                    fprintf(stderr,
                            "%s: stk500v2_getsync(): got response from unknown "
                            "programmer %s, assuming STK500\n",
                            progname, resp + 3);
                PDATA(pgm)->pgmtype = PGMTYPE_STK500;
            }
            if (verbose >= 3)
                fprintf(stderr,
                        "%s: stk500v2_getsync(): found %s programmer\n",
                        progname, pgmname[PDATA(pgm)->pgmtype]);
            return 0;
        } else {
            if (tries > RETRIES) {
                fprintf(stderr,
                        "%s: stk500v2_getsync(): can't communicate with device: resp=0x%02x\n",
                        progname, resp[0]);
                return -6;
            } else
                goto retry;
        }

        // or if we got a timeout
    } else if (status == -1) {
        if (tries > RETRIES) {
            fprintf(stderr,"%s: stk500v2_getsync(): timeout communicating with programmer\n",
                    progname);
            return -1;
        } else
            goto retry;

        // or any other error
    } else {
        if (tries > RETRIES) {
            fprintf(stderr,"%s: stk500v2_getsync(): error communicating with programmer: (%d)\n",
                    progname,status);
        } else
            goto retry;
    }

    return 0;
}

int stk500v2_drain(PROGRAMMER * pgm, int display)
{
    return serial_drain(&pgm->fd, display);
}


/*
 * initialize the AVR device and prepare it to accept commands
 */
static int stk500v2_initialize(PROGRAMMER * pgm, AVRPART * p)
{

    if ((PDATA(pgm)->pgmtype == PGMTYPE_STK600 ||
         PDATA(pgm)->pgmtype == PGMTYPE_AVRISP_MKII ||
         PDATA(pgm)->pgmtype == PGMTYPE_JTAGICE_MKII) != 0
        && (p->flags & (AVRPART_HAS_PDI | AVRPART_HAS_TPI)) != 0) {
        /*
         * This is an ATxmega device, must use XPROG protocol for the
         * remaining actions.
         */
        if ((p->flags & AVRPART_HAS_PDI) != 0) {
            /*
             * Find out where the border between application and boot area
             * is.
             */
            AVRMEM *bootmem = avr_locate_mem(p, "boot");
            AVRMEM *flashmem = avr_locate_mem(p, "flash");
            if (bootmem == NULL || flashmem == NULL) {
                fprintf(stderr,
                        "%s: stk500v2_initialize(): Cannot locate \"flash\" and \"boot\" memories in description\n",
                        progname);
            } else {
                PDATA(pgm)->boot_start = bootmem->offset - flashmem->offset;
            }
        }
        stk600_setup_xprog(pgm);
    } else {
        stk600_setup_isp(pgm);
    }

    if (p->flags & AVRPART_IS_AT90S1200) {
        /*
         * AT90S1200 needs a positive reset pulse after a chip erase.
         */
        pgm->disable(pgm);
        usleep(10000);
    }

    return pgm->program_enable(pgm, p);
}



static void stk500v2_display(PROGRAMMER * pgm, const char * p)
{
    unsigned char maj, min, hdw, topcard, maj_s1, min_s1, maj_s2, min_s2;
    unsigned int rev;
    const char *topcard_name, *pgmname;

    switch (PDATA(pgm)->pgmtype) {
    case PGMTYPE_UNKNOWN:     pgmname = "Unknown"; break;
    case PGMTYPE_STK500:      pgmname = "STK500"; break;
    case PGMTYPE_AVRISP:      pgmname = "AVRISP"; break;
    case PGMTYPE_AVRISP_MKII: pgmname = "AVRISP mkII"; break;
    case PGMTYPE_STK600:      pgmname = "STK600"; break;
    default:                  pgmname = "None";
    }
    if (PDATA(pgm)->pgmtype != PGMTYPE_JTAGICE_MKII &&
        PDATA(pgm)->pgmtype != PGMTYPE_JTAGICE3) {
        fprintf(stderr, "%sProgrammer Model: %s\n", p, pgmname);
        stk500v2_getparm(pgm, PARAM_HW_VER, &hdw);
        stk500v2_getparm(pgm, PARAM_SW_MAJOR, &maj);
        stk500v2_getparm(pgm, PARAM_SW_MINOR, &min);
        fprintf(stderr, "%sHardware Version: %d\n", p, hdw);
        fprintf(stderr, "%sFirmware Version Master : %d.%02d\n", p, maj, min);
        if (PDATA(pgm)->pgmtype == PGMTYPE_STK600) {
            stk500v2_getparm(pgm, PARAM_SW_MAJOR_SLAVE1, &maj_s1);
            stk500v2_getparm(pgm, PARAM_SW_MINOR_SLAVE1, &min_s1);
            stk500v2_getparm(pgm, PARAM_SW_MAJOR_SLAVE2, &maj_s2);
            stk500v2_getparm(pgm, PARAM_SW_MINOR_SLAVE2, &min_s2);
            fprintf(stderr, "%sFirmware Version Slave 1: %d.%02d\n", p, maj_s1, min_s1);
            fprintf(stderr, "%sFirmware Version Slave 2: %d.%02d\n", p, maj_s2, min_s2);
        }
    }

    if (PDATA(pgm)->pgmtype == PGMTYPE_STK500) {
        stk500v2_getparm(pgm, PARAM_TOPCARD_DETECT, &topcard);
        switch (topcard) {
        case 0xAA: topcard_name = "STK501"; break;
        case 0x55: topcard_name = "STK502"; break;
        case 0xFA: topcard_name = "STK503"; break;
        case 0xEE: topcard_name = "STK504"; break;
        case 0xE4: topcard_name = "STK505"; break;
        case 0xDD: topcard_name = "STK520"; break;
        default: topcard_name = "Unknown"; break;
        }
        fprintf(stderr, "%sTopcard         : %s\n", p, topcard_name);
    } else if (PDATA(pgm)->pgmtype == PGMTYPE_STK600) {
        stk500v2_getparm(pgm, PARAM_ROUTINGCARD_ID, &topcard);
        fprintf(stderr, "%sRouting card    : %s\n", p,
                stk600_get_cardname(routing_cards,
                                    sizeof routing_cards / sizeof routing_cards[0],
                                    topcard));
        stk500v2_getparm(pgm, PARAM_SOCKETCARD_ID, &topcard);
        fprintf(stderr, "%sSocket card     : %s\n", p,
                stk600_get_cardname(socket_cards,
                                    sizeof socket_cards / sizeof socket_cards[0],
                                    topcard));
        stk500v2_getparm2(pgm, PARAM2_RC_ID_TABLE_REV, &rev);
        fprintf(stderr, "%sRC_ID table rev : %d\n", p, rev);
        stk500v2_getparm2(pgm, PARAM2_EC_ID_TABLE_REV, &rev);
        fprintf(stderr, "%sEC_ID table rev : %d\n", p, rev);
    }
    stk500v2_print_parms1(pgm, p);

    return;
}

static void stk500v2_enable(PROGRAMMER * pgm)
{
    return;
}

static void stk500v2_disable(PROGRAMMER * pgm)
{
    unsigned char buf[16];
    int result;

    buf[0] = CMD_LEAVE_PROGMODE_ISP;
    buf[1] = 1; // preDelay;
    buf[2] = 1; // postDelay;

    result = stk500v2_command(pgm, buf, 3, sizeof(buf));

    if (result < 0) {
        fprintf(stderr,
                "%s: stk500v2_disable(): failed to leave programming mode\n",
                progname);
    }

    return;
}

/*
 * issue the 'program enable' command to the AVR device
 */
static int stk500v2_program_enable(PROGRAMMER * pgm, AVRPART * p)
{
    unsigned char buf[16];
    char msg[100];             /* see remarks above about size needed */
    int rv, tries;

    PDATA(pgm)->lastpart = p;

    if (p->op[AVR_OP_PGM_ENABLE] == NULL) {
        fprintf(stderr, "%s: stk500v2_program_enable(): program enable instruction not defined for part \"%s\"\n",
                progname, p->desc);
        return -1;
    }

    if (PDATA(pgm)->pgmtype == PGMTYPE_STK500 ||
        PDATA(pgm)->pgmtype == PGMTYPE_STK600)
        /* Activate AVR-style (low active) RESET */
        stk500v2_setparm_real(pgm, PARAM_RESET_POLARITY, 0x01);

    tries = 0;
retry:
    buf[0] = CMD_ENTER_PROGMODE_ISP;
    buf[1] = p->timeout;
    buf[2] = p->stabdelay;
    buf[3] = p->cmdexedelay;
    buf[4] = p->synchloops;
    buf[5] = p->bytedelay;
    buf[6] = p->pollvalue;
    buf[7] = p->pollindex;
    avr_set_bits(p->op[AVR_OP_PGM_ENABLE], buf+8);
    buf[10] = buf[11] = 0;

    rv = stk500v2_command(pgm, buf, 12, sizeof(buf));

    if (rv < 0) {
        switch (PDATA(pgm)->pgmtype)
        {
        case PGMTYPE_STK600:
        case PGMTYPE_AVRISP_MKII:
            if (stk500v2_getparm(pgm, PARAM_STATUS_TGT_CONN, &buf[0]) != 0) {
                fprintf(stderr,
                        "%s: stk500v2_program_enable(): cannot get connection status\n",
                        progname);
            } else {
                stk500v2_translate_conn_status(buf[0], msg);
                fprintf(stderr, "%s: stk500v2_program_enable():"
                        " bad AVRISPmkII connection status: %s\n",
                        progname, msg);
            }
            break;

        case PGMTYPE_JTAGICE3:
            if (buf[1] == STATUS_CMD_FAILED &&
                (p->flags & AVRPART_HAS_DW) != 0) {
                void *mycookie;
                unsigned char cmd[4], *resp;

                /* Try debugWIRE, and MONCON_DISABLE */
                if (verbose >= 2)
                    fprintf(stderr,
                            "%s: No response in ISP mode, trying debugWIRE\n",
                            progname);

                mycookie = pgm->cookie;
                pgm->cookie = PDATA(pgm)->chained_pdata;

                cmd[0] = PARM3_CONN_DW;
                if (jtag3_setparm(pgm, SCOPE_AVR, 1, PARM3_CONNECTION, cmd, 1) < 0) {
                    pgm->cookie = mycookie;
                    break;
                }

                cmd[0] = SCOPE_AVR;

                cmd[1] = CMD3_SIGN_ON;
                cmd[2] = cmd[3] = 0;
                if (jtag3_command(pgm, cmd, 4, &resp, "AVR sign-on") >= 0) {
                    free(resp);

                    cmd[1] = CMD3_START_DW_DEBUG;
                    if (jtag3_command(pgm, cmd, 4, &resp, "start DW debug") >= 0) {
                        free(resp);

                        cmd[1] = CMD3_MONCON_DISABLE;
                        if (jtag3_command(pgm, cmd, 3, &resp, "MonCon disable") >= 0)
                            free(resp);
                    }
                }
                pgm->cookie = mycookie;
                if (tries++ > 3) {
                    fprintf(stderr,
                            "%s: Failed to return from debugWIRE to ISP.\n",
                            progname);
                    break;
                }
                fprintf(stderr,
                        "%s: Target prepared for ISP, signed off.\n"
                        "%s: Now retrying without power-cycling the target.\n",
                        progname, progname);
                goto retry;
            }
            break;

        default:
            /* cannot report anything for other pgmtypes */
            break;
        }
    }

    return rv;
}

/*
 * issue the 'chip erase' command to the AVR device
 */
static int stk500v2_chip_erase(PROGRAMMER * pgm, AVRPART * p)
{
    int result;
    unsigned char buf[16];

    if (p->op[AVR_OP_CHIP_ERASE] == NULL) {
        fprintf(stderr, "%s: stk500v2_chip_erase: chip erase instruction not defined for part \"%s\"\n",
                progname, p->desc);
        return -1;
    }

    pgm->pgm_led(pgm, ON);

    buf[0] = CMD_CHIP_ERASE_ISP;
    buf[1] = p->chip_erase_delay / 1000;
    buf[2] = 0;	// use delay (?)
    avr_set_bits(p->op[AVR_OP_CHIP_ERASE], buf+3);
    result = stk500v2_command(pgm, buf, 7, sizeof(buf));
    usleep(p->chip_erase_delay);
    pgm->initialize(pgm, p);

    pgm->pgm_led(pgm, OFF);

    return result >= 0? 0: -1;
}

static int stk500v2_cmd(PROGRAMMER * pgm, const unsigned char *cmd,
                        unsigned char *res)
{
    unsigned char buf[8];
    int result;

    DEBUG("STK500V2: stk500v2_cmd(%02x,%02x,%02x,%02x)\n",cmd[0],cmd[1],cmd[2],cmd[3]);

    buf[0] = CMD_SPI_MULTI;
    buf[1] = 4;
    buf[2] = 4;
    buf[3] = 0;
    buf[4] = cmd[0];
    buf[5] = cmd[1];
    buf[6] = cmd[2];
    buf[7] = cmd[3];

    result = stk500v2_command(pgm, buf, 8, sizeof(buf));
    if (result < 0) {
        fprintf(stderr, "%s: stk500v2_cmd(): failed to send command\n",
                progname);
        return -1;
    } else if (result < 6) {
        fprintf(stderr, "%s: stk500v2_cmd(): short reply, len = %d\n",
                progname, result);
        return -1;
    }

    res[0] = buf[2];
    res[1] = buf[3];
    res[2] = buf[4];
    res[3] = buf[5];

    return 0;
}

static int stk500v2_open(PROGRAMMER * pgm, char * port)
{
    long baud = 115200;

    DEBUG("STK500V2: stk500v2_open()\n");

    if (pgm->baudrate)
        baud = pgm->baudrate;

    PDATA(pgm)->pgmtype = PGMTYPE_UNKNOWN;

    if(strcasecmp(port, "avrdoper") == 0){
#if defined(HAVE_LIBUSB) || (defined(WIN32NATIVE) && defined(HAVE_LIBHID))
        serdev = &avrdoper_serdev;
        PDATA(pgm)->pgmtype = PGMTYPE_STK500;
#else
        fprintf(stderr, "avrdude was compiled without usb support.\n");
        return -1;
#endif
    }

    /*
     * If the port name starts with "usb", divert the serial routines
     * to the USB ones.  The serial_open() function for USB overrides
     * the meaning of the "baud" parameter to be the USB device ID to
     * search for.
     */
    if (strncmp(port, "usb", 3) == 0) {
#if defined(HAVE_LIBUSB)
        serdev = &usb_serdev_frame;
        baud = USB_DEVICE_AVRISPMKII;
        PDATA(pgm)->pgmtype = PGMTYPE_AVRISP_MKII;
        pgm->set_sck_period = stk500v2_set_sck_period_mk2;
        pgm->fd.usb.max_xfer = USBDEV_MAX_XFER_MKII;
        pgm->fd.usb.rep = USBDEV_BULK_EP_READ_MKII;
        pgm->fd.usb.wep = USBDEV_BULK_EP_WRITE_MKII;
        pgm->fd.usb.eep = 0;           /* no seperate EP for events */
#else
        fprintf(stderr, "avrdude was compiled without usb support.\n");
        return -1;
#endif
    }

    strcpy(pgm->port, port);
    if (serial_open(port, baud, &pgm->fd)==-1) {
        return -1;
    }

    /*
     * drain any extraneous input
     */
    stk500v2_drain(pgm, 0);

    stk500v2_getsync(pgm);

    stk500v2_drain(pgm, 0);

    if (pgm->bitclock != 0.0) {
        if (pgm->set_sck_period(pgm, pgm->bitclock) != 0)
            return -1;
    }

    return 0;
}

static void stk500v2_close(PROGRAMMER * pgm)
{
    DEBUG("STK500V2: stk500v2_close()\n");

    serial_close(&pgm->fd);
    pgm->fd.ifd = -1;
}



static int stk500v2_paged_write(PROGRAMMER * pgm, AVRPART * p, AVRMEM * m,
                                unsigned int page_size,
                                unsigned int addr, unsigned int n_bytes)
{
    unsigned int block_size, last_addr, addrshift, use_ext_addr;
    unsigned int maxaddr = addr + n_bytes;
    unsigned char commandbuf[10];
    unsigned char buf[266];
    unsigned char cmds[4];
    int result;
    OPCODE * rop, * wop;

    DEBUG("STK500V2: stk500v2_paged_write(..,%s,%u,%u,%u)\n",
          m->desc, page_size, addr, n_bytes);

    if (page_size == 0) page_size = 256;
    addrshift = 0;
    use_ext_addr = 0;

    // determine which command is to be used
    if (strcmp(m->desc, "flash") == 0) {
        addrshift = 1;
        commandbuf[0] = CMD_PROGRAM_FLASH_ISP;
        /*
         * If bit 31 is set, this indicates that the following read/write
         * operation will be performed on a memory that is larger than
         * 64KBytes. This is an indication to STK500 that a load extended
         * address must be executed.
         */
        if (m->op[AVR_OP_LOAD_EXT_ADDR] != NULL) {
            use_ext_addr = (1U << 31);
        }
    } else if (strcmp(m->desc, "eeprom") == 0) {
        commandbuf[0] = CMD_PROGRAM_EEPROM_ISP;
    }
    commandbuf[4] = m->delay;

    if (addrshift == 0) {
        wop = m->op[AVR_OP_WRITE];
        rop = m->op[AVR_OP_READ];
    }
    else {
        wop = m->op[AVR_OP_WRITE_LO];
        rop = m->op[AVR_OP_READ_LO];
    }

    // if the memory is paged, load the appropriate commands into the buffer
    if (m->mode & 0x01) {
        commandbuf[3] = m->mode | 0x80;		// yes, write the page to flash

        if (m->op[AVR_OP_LOADPAGE_LO] == NULL) {
            fprintf(stderr, "%s: stk500v2_paged_write: loadpage instruction not defined for part \"%s\"\n",
                    progname, p->desc);
            return -1;
        }
        avr_set_bits(m->op[AVR_OP_LOADPAGE_LO], cmds);
        commandbuf[5] = cmds[0];

        if (m->op[AVR_OP_WRITEPAGE] == NULL) {
            fprintf(stderr, "%s: stk500v2_paged_write: write page instruction not defined for part \"%s\"\n",
                    progname, p->desc);
            return -1;
        }
        avr_set_bits(m->op[AVR_OP_WRITEPAGE], cmds);
        commandbuf[6] = cmds[0];

        // otherwise, we need to load different commands in
    }
    else {
        commandbuf[3] = m->mode | 0x80;		// yes, write the words to flash

        if (wop == NULL) {
            fprintf(stderr, "%s: stk500v2_paged_write: write instruction not defined for part \"%s\"\n",
                    progname, p->desc);
            return -1;
        }
        avr_set_bits(wop, cmds);
        commandbuf[5] = cmds[0];
        commandbuf[6] = 0;
    }

    // the read command is common to both methods
    if (rop == NULL) {
        fprintf(stderr, "%s: stk500v2_paged_write: read instruction not defined for part \"%s\"\n",
                progname, p->desc);
        return -1;
    }
    avr_set_bits(rop, cmds);
    commandbuf[7] = cmds[0];

    commandbuf[8] = m->readback[0];
    commandbuf[9] = m->readback[1];

    last_addr=UINT_MAX;		/* impossible address */

    for (; addr < maxaddr; addr += page_size) {
        if ((maxaddr - addr) < page_size)
            block_size = maxaddr - addr;
        else
            block_size = page_size;

        DEBUG("block_size at addr %d is %d\n",addr,block_size);

        memcpy(buf,commandbuf,sizeof(commandbuf));

        buf[1] = block_size >> 8;
        buf[2] = block_size & 0xff;

        if((last_addr==UINT_MAX)||(last_addr+block_size != addr)){
            if (stk500v2_loadaddr(pgm, use_ext_addr | (addr >> addrshift)) < 0)
                return -1;
        }
        last_addr=addr;

        memcpy(buf+10,m->buf+addr, block_size);

        result = stk500v2_command(pgm,buf,block_size+10, sizeof(buf));
        if (result < 0) {
            fprintf(stderr,
                    "%s: stk500v2_paged_write: write command failed\n",
                    progname);
            return -1;
        }
    }

    return n_bytes;
}



static int stk500v2_paged_load(PROGRAMMER * pgm, AVRPART * p, AVRMEM * m,
                               unsigned int page_size,
                               unsigned int addr, unsigned int n_bytes)
{
    unsigned int block_size, hiaddr, addrshift, use_ext_addr;
    unsigned int maxaddr = addr + n_bytes;
    unsigned char commandbuf[4];
    unsigned char buf[275];	// max buffer size for stk500v2 at this point
    unsigned char cmds[4];
    int result;
    OPCODE * rop;

    DEBUG("STK500V2: stk500v2_paged_load(..,%s,%u,%u,%u)\n",
          m->desc, page_size, addr, n_bytes);

    page_size = m->readsize;

    rop = m->op[AVR_OP_READ];

    hiaddr = UINT_MAX;
    addrshift = 0;
    use_ext_addr = 0;

    // determine which command is to be used
    if (strcmp(m->desc, "flash") == 0) {
        commandbuf[0] = CMD_READ_FLASH_ISP;
        rop = m->op[AVR_OP_READ_LO];
        addrshift = 1;
        /*
         * If bit 31 is set, this indicates that the following read/write
         * operation will be performed on a memory that is larger than
         * 64KBytes. This is an indication to STK500 that a load extended
         * address must be executed.
         */
        if (m->op[AVR_OP_LOAD_EXT_ADDR] != NULL) {
            use_ext_addr = (1U << 31);
        }
    }
    else if (strcmp(m->desc, "eeprom") == 0) {
        commandbuf[0] = CMD_READ_EEPROM_ISP;
    }

    // the read command is common to both methods
    if (rop == NULL) {
        fprintf(stderr, "%s: stk500v2_paged_load: read instruction not defined for part \"%s\"\n",
                progname, p->desc);
        return -1;
    }
    avr_set_bits(rop, cmds);
    commandbuf[3] = cmds[0];

    for (; addr < maxaddr; addr += page_size) {
        if ((maxaddr - addr) < page_size)
            block_size = maxaddr - addr;
        else
            block_size = page_size;
        DEBUG("block_size at addr %d is %d\n",addr,block_size);

        memcpy(buf,commandbuf,sizeof(commandbuf));

        buf[1] = block_size >> 8;
        buf[2] = block_size & 0xff;

        // Ensure a new "load extended address" will be issued
        // when crossing a 64 KB boundary in flash.
        if (hiaddr != (addr & ~0xFFFF)) {
            hiaddr = addr & ~0xFFFF;
            if (stk500v2_loadaddr(pgm, use_ext_addr | (addr >> addrshift)) < 0)
                return -1;
        }

        result = stk500v2_command(pgm,buf,4,sizeof(buf));
        if (result < 0) {
            fprintf(stderr,
                    "%s: stk500v2_paged_load: read command failed\n",
                    progname);
            return -1;
        }
#if 0
        for (i=0;i<page_size;i++) {
            fprintf(stderr,"%02X",buf[2+i]);
            if (i%16 == 15) fprintf(stderr,"\n");
        }
#endif

        memcpy(&m->buf[addr], &buf[2], block_size);
    }

    return n_bytes;
}



static int stk500v2_page_erase(PROGRAMMER * pgm, AVRPART * p, AVRMEM * m,
                               unsigned int addr)
{
    fprintf(stderr,
            "%s: stk500v2_page_erase(): this function must never be called\n",
            progname);
    return -1;
}



static void stk500v2_print_parms(PROGRAMMER * pgm)
{
    stk500v2_print_parms1(pgm, "");
}



static int stk500v2_set_vtarget(PROGRAMMER * pgm, double v)
{
    unsigned char uaref, utarg;

    utarg = (unsigned)((v + 0.049) * 10);

    if (stk500v2_getparm(pgm, PARAM_VADJUST, &uaref) != 0) {
        fprintf(stderr,
                "%s: stk500v2_set_vtarget(): cannot obtain V[aref]\n",
                progname);
        return -1;
    }

    if (uaref > utarg) {
        fprintf(stderr,
                "%s: stk500v2_set_vtarget(): reducing V[aref] from %.1f to %.1f\n",
                progname, uaref / 10.0, v);
        if (stk500v2_setparm(pgm, PARAM_VADJUST, utarg)
            != 0)
            return -1;
    }
    return stk500v2_setparm(pgm, PARAM_VTARGET, utarg);
}



static int stk500v2_set_varef(PROGRAMMER * pgm, unsigned int chan /* unused */,
                              double v)
{
    unsigned char uaref, utarg;

    uaref = (unsigned)((v + 0.049) * 10);

    if (stk500v2_getparm(pgm, PARAM_VTARGET, &utarg) != 0) {
        fprintf(stderr,
                "%s: stk500v2_set_varef(): cannot obtain V[target]\n",
                progname);
        return -1;
    }

    if (uaref > utarg) {
        fprintf(stderr,
                "%s: stk500v2_set_varef(): V[aref] must not be greater than "
                "V[target] = %.1f\n",
                progname, utarg / 10.0);
        return -1;
    }
    return stk500v2_setparm(pgm, PARAM_VADJUST, uaref);
}



static int stk500v2_set_fosc(PROGRAMMER * pgm, double v)
{
    int fosc;
    unsigned char prescale, cmatch;
    static unsigned ps[] = {
        1, 8, 32, 64, 128, 256, 1024
    };
    int idx, rc;

    prescale = cmatch = 0;
    if (v > 0.0) {
        if (v > STK500V2_XTAL / 2) {
            const char *unit;
            if (v > 1e6) {
                v /= 1e6;
                unit = "MHz";
            } else if (v > 1e3) {
                v /= 1e3;
                unit = "kHz";
            } else
                unit = "Hz";
            fprintf(stderr,
                    "%s: stk500v2_set_fosc(): f = %.3f %s too high, using %.3f MHz\n",
                    progname, v, unit, STK500V2_XTAL / 2e6);
            fosc = STK500V2_XTAL / 2;
        } else
            fosc = (unsigned)v;

        for (idx = 0; idx < sizeof(ps) / sizeof(ps[0]); idx++) {
            if (fosc >= STK500V2_XTAL / (256 * ps[idx] * 2)) {
                /* this prescaler value can handle our frequency */
                prescale = idx + 1;
                cmatch = (unsigned)(STK500V2_XTAL / (2 * fosc * ps[idx])) - 1;
                break;
            }
        }
        if (idx == sizeof(ps) / sizeof(ps[0])) {
            fprintf(stderr, "%s: stk500v2_set_fosc(): f = %u Hz too low, %u Hz min\n",
                    progname, fosc, STK500V2_XTAL / (256 * 1024 * 2));
            return -1;
        }
    }

    if ((rc = stk500v2_setparm(pgm, PARAM_OSC_PSCALE, prescale)) != 0
        || (rc = stk500v2_setparm(pgm, PARAM_OSC_CMATCH, cmatch)) != 0)
        return rc;

    return 0;
}


* This algorithm only fits for the STK500 itself.  For the (old)
* AVRISP, the resulting ISP clock is only half.  While this would be
* easy to fix in the algorithm, we'd need to add another
 * configuration flag for this to the config file.  Given the old
 * AVRISP devices are virtually no longer around (and the AVRISPmkII
 * uses a different algorithm below), it's probably not worth the
* hassle.
*/
static int stk500v2_set_sck_period(PROGRAMMER * pgm, double v)
{
    unsigned int d;
    unsigned char dur;
    double f = 1 / v;

    if (f >= 1.8432E6)
        d = 0;
    else if (f > 460.8E3)
        d = 1;
    else if (f > 115.2E3)
        d = 2;
    else if (f > 57.6E3)
        d = 3;
    else
        d = (unsigned int)ceil(1 / (24 * f / (double)STK500V2_XTAL) - 10.0 / 12.0);
    if (d >= 255)
        d = 254;
    dur = d;

    return stk500v2_setparm(pgm, PARAM_SCK_DURATION, dur);
}



static int stk500v2_perform_osccal(PROGRAMMER * pgm)
{
    unsigned char buf[32];
    int rv;

    buf[0] = CMD_OSCCAL;

    rv = stk500v2_command(pgm, buf, 1, sizeof(buf));
    if (rv < 0) {
        fprintf(stderr, "%s: stk500v2_perform_osccal(): failed\n",
                progname);
        return -1;
    }

    return 0;
}



void stk500v2_setup(PROGRAMMER * pgm)
{
    if ((pgm->cookie = malloc(sizeof(struct pdata))) == 0) {
        fprintf(stderr,
                "%s: stk500v2_setup(): Out of memory allocating private data\n",
                progname);
        exit(1);
    }
    memset(pgm->cookie, 0, sizeof(struct pdata));
    PDATA(pgm)->command_sequence = 1;
    PDATA(pgm)->boot_start = ULONG_MAX;
}



void stk500v2_teardown(PROGRAMMER * pgm)
{
    free(pgm->cookie);
}

const char stk500v2_desc[] = "Atmel STK500 Version 2.x firmware";

void stk500v2_initpgm(PROGRAMMER * pgm)
{
    strcpy(pgm->type, "STK500V2");

    /*
     * mandatory functions
     */
    pgm->initialize     = stk500v2_initialize;
    pgm->display        = stk500v2_display;
    pgm->enable         = stk500v2_enable;
    pgm->disable        = stk500v2_disable;
    pgm->program_enable = stk500v2_program_enable;
    pgm->chip_erase     = stk500v2_chip_erase;
    pgm->cmd            = stk500v2_cmd;
    pgm->open           = stk500v2_open;
    pgm->close          = stk500v2_close;
    pgm->read_byte      = avr_read_byte_default;
    pgm->write_byte     = avr_write_byte_default;

    /*
     * optional functions
     */
    pgm->paged_write    = stk500v2_paged_write;
    pgm->paged_load     = stk500v2_paged_load;
    pgm->page_erase     = stk500v2_page_erase;
    pgm->print_parms    = stk500v2_print_parms;
    pgm->set_vtarget    = stk500v2_set_vtarget;
    pgm->set_varef      = stk500v2_set_varef;
    pgm->set_fosc       = stk500v2_set_fosc;
    pgm->set_sck_period = stk500v2_set_sck_period;
    pgm->perform_osccal = stk500v2_perform_osccal;
    pgm->setup          = stk500v2_setup;
    pgm->teardown       = stk500v2_teardown;
    pgm->page_size      = 256;
}
