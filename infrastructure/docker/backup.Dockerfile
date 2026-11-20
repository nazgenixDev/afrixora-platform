FROM postgres:15-alpine
RUN apk add --no-cache bash openssl tzdata
COPY scripts/backup.sh /usr/local/bin/backup.sh
ENTRYPOINT ["/bin/sh", "-ec"]
CMD ["/usr/local/bin/backup.sh --check || /usr/local/bin/backup.sh; printf '%s\n' '0 2 * * * /usr/local/bin/backup.sh >/proc/1/fd/1 2>/proc/1/fd/2' > /etc/crontabs/root; exec crond -f -l 2"]
