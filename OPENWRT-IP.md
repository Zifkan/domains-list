# IP-сети для OpenWrt

Существующий `getdomains` и `_all_in_one.lst` остаются без изменений. Отдельный
список `_all_in_one_ipv4.lst` по умолчанию содержит IP-сети Telegram и Discord:
GeoIP MetaCubeX, официальный список Telegram и общественный список Discord
`sdnv0x4d/ip-lists`, включая голосовые адреса. Список Discord неофициальный,
поэтому его полноту и актуальность необходимо проверять. IPv6 также сохраняется
в `_all_in_one_ipv6.lst`, но в правила OpenWrt ниже не загружается.

В секрет CONFIG_CONTENT можно добавить настройки (по умолчанию уже включены):

```json
"generateIpFiles": true,
"ipServices": ["telegram", "discord"],
"additionalIpLists": {
  "myservice": ["https://example.org/ipv4-and-ipv6-cidrs.txt"]
}
```

Дополнительные источники используют один IP/CIDR на строку и поддерживают
комментарии `#`. Ошибка источника или некорректный список останавливает сборку.
Для других сервисов добавьте их в `ipServices` или `additionalIpLists`; IP общей
инфраструктуры могут направлять через VPN и посторонние сервисы. Установите
`generateIpFiles: false`, чтобы отключить IP-списки.

## Установка

После коммита и push запустите GitHub Actions и дождитесь появления
`lists/_all_in_one_ipv4.lst`. Скрипт рассчитан на показанную конфигурацию:
OpenWrt fw4, LAN `br-lan`, метку `0x1`, таблицу `vpn` с маршрутом через `awg1`.
Нужны `curl` и `nft`. Существующий `/etc/init.d/getdomains` сохраняется.

```sh
curl -fL https://raw.githubusercontent.com/Zifkan/domains-list/refs/heads/main/openwrt/getips -o /tmp/getips.new
sh -n /tmp/getips.new
```

Только при успешном выполнении обеих команд:

```sh
cp /tmp/getips.new /etc/init.d/getips
chmod +x /etc/init.d/getips
/etc/init.d/getips enable
/etc/init.d/getips start
```

Добавьте отдельную строку в `crontab -e`:

```text
0 */8 * * * /etc/init.d/getips start
```

Скрипт создаёт отдельную таблицу `inet domains_list`, не затрагивая
`inet fw4 vpn_domains`, BGP, доменный список или dnsmasq. В ней хранится
отдельный набор подсетей и правило выставления той же метки `0x1` для
транзитного IPv4-трафика `br-lan`. Обновление выполняется одной nft-транзакцией;
при ошибке скачивания или проверки действующие IP-правила сохраняются. На
старте скрипт повторяет попытки, но после перезагрузки при длительном отсутствии
сети правило появится только после следующего успешного запуска. `fw4 flush`
удаляет все nft-таблицы, после него запустите `getips` снова.

Проверка:

```sh
nft list table inet domains_list
ip rule show
ip route get 149.154.160.1 mark 0x1
```

Нужно проверить работу Telegram и звонков/трансляций Discord на клиентах, а
также повторить после перезапуска роутера. Пока BGP работает, трафик Telegram
уже может идти через awg1 по BGP-маршрутам — это не доказывает работу нового
правила. При подключении клиента проверьте рост `counter packets` в выводе nft.
Не отключайте BGP до проверки счётчиков/маршрутов и других сервисов,
которые могли его использовать. На роутере с данной конфигурацией код ещё не
проверен. В показанном выводе `nft list set inet fw4 vpn_domains` нет результата,
поэтому состояние этого набора не подтверждено.
